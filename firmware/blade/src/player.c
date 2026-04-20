// firmware/blade/src/player.c
// SYNCHRON Blade Controller — Show Player
//
// Two independent time domains:
//   Domain 1: Angular/POV rendering, corrected every revolution by IR index pulse
//   Domain 2: Show sequence clock from t0, never touched by RPM correction
//
// Memory layout (fits in 264KB RP2040 SRAM):
//   pattern_buf_a[51840]  ~51KB  active pattern (180 slices x 72px x 4 bytes)
//   pattern_buf_b[51840]  ~51KB  prefetch buffer for next event
//   event_table[8192]     ~8KB   full event list cached at boot
//   scratch[2048]         ~2KB   canned cycle computation
//   Total used: ~113KB, leaving ~151KB for SDK/USB/stack

#include "player.h"
#include "sk9822_pio.h"
#include "common/flash_if.h"
#include "common/sk9822.h"
#include "pico/stdlib.h"
#include "hardware/dma.h"
#include "hardware/pio.h"
#include "hardware/gpio.h"
#include "hardware/irq.h"
#include "hardware/clocks.h"
#include "uart_rx.pio.h"
#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <stdio.h>

// ─── Constants ────────────────────────────────────────────────────────────────

#define SLICES_PER_REV      180
#define PIXELS_PER_BLADE    72      // pixels per blade segment chain
#define PIXELS_PER_SEGMENT  36      // one PIO lane drives 36 pixels
#define BYTES_PER_PIXEL     4       // SK9822: brightness + B + G + R

// Pattern buffer: one full revolution of pixel data
// Layout: [slice_0: 72 pixels][slice_1: 72 pixels]...[slice_179: 72 pixels]
// Each pixel: [0xE0|bri][B][G][R]
#define PATTERN_BUF_BYTES   (SLICES_PER_REV * PIXELS_PER_BLADE * BYTES_PER_PIXEL)
// = 180 * 72 * 4 = 51,840 bytes

#define EVENT_TABLE_FLASH_OFFSET  0x001000
#define PATTERN_POOL_FLASH_OFFSET 0x003000
#define IMAGE_DATA_FLASH_OFFSET   0x100000

#define EVENT_ENTRY_BYTES   10      // per event: startMs(4) durationMs(4) type(1) patIdx(1)
#define MAX_EVENTS          819     // floor((0x3000-0x1000)/10)

#define EVENT_TYPE_FUSELAGE 0x01
#define EVENT_TYPE_BLADE    0x02
#define EVENT_TYPE_BOTH     0x03

#define FN_SOLID_COLOR      0x01
#define FN_SWEEP            0x02
#define FN_STROBE           0x03
#define FN_RADIAL_GRADIENT  0x04
#define FN_COLOR_WIPE       0x05
#define FN_BRIGHTNESS_FADE  0x06
#define FN_RAW_ARRAY        0x07
#define FN_STRESS_TEST      0xFE

// GPIO pins (from HW_PINS_BLADE.md)
#define GP_IR_INDEX         14
#define GP_XBUS_RX          28      // JR XBUS Mode B input (PIO UART, 250kbps)

// XBUS streaming protocol
#define XBUS_BAUD           250000
#define XBUS_MAX_CHANNELS   22      // 0x01..0x16 supported by sliding-window sync

// CH6 = show start/stop with debounce
#define XBUS_START_THRESH   1900    // us — above this for N records = start
#define XBUS_STOP_THRESH    1200    // us — below this for N records = stop
#define XBUS_DEBOUNCE_RECS  5       // consecutive records to confirm

// CH8 = bailout (immediate, no debounce)
#define XBUS_BAILOUT_THRESH 1800

// PIO lane GPIOs: data+clock pairs
#define GP_SEG1_TOP_DATA    2
#define GP_SEG1_TOP_CLK     3
#define GP_SEG2_TOP_DATA    4
#define GP_SEG2_TOP_CLK     5
#define GP_SEG1_BOT_DATA    12
#define GP_SEG1_BOT_CLK     13
#define GP_SEG2_BOT_DATA    11
#define GP_SEG2_BOT_CLK     15

// Period smoothing: rolling average over N revolutions
#define PERIOD_SMOOTH_N     8

// ─── Types ────────────────────────────────────────────────────────────────────

typedef struct {
    uint32_t start_ms;
    uint32_t duration_ms;
    uint8_t  type;
    uint8_t  pattern_idx;
} EventEntry;

typedef struct {
    uint8_t  fn_id;
    uint8_t  r, g, b;
    uint8_t  bri;           // 0-31
    uint32_t param_a;       // fn-specific: width_deg, on_ms, etc.
    uint32_t param_b;       // fn-specific: phase_offset, off_ms, etc.
    uint8_t  r2, g2, b2;   // secondary color (gradient end)
} CannedParams;

// ─── Static storage ───────────────────────────────────────────────────────────

// Double-buffer: A is active, B is prefetch
static uint8_t pattern_buf_a[PATTERN_BUF_BYTES];
static uint8_t pattern_buf_b[PATTERN_BUF_BYTES];
static uint8_t *active_buf   = pattern_buf_a;
static uint8_t *prefetch_buf = pattern_buf_b;

// Event table cached from flash
static EventEntry event_table[MAX_EVENTS];
static uint32_t   event_count = 0;

// Domain 1 state
static volatile uint32_t ir_pulse_time_us  = 0;
static volatile bool      ir_pulse_flag     = false;
static uint32_t           rev_period_us     = 28571; // ~2100 RPM default
static uint32_t           period_history[PERIOD_SMOOTH_N];
static uint8_t            period_history_idx = 0;
static uint8_t            period_history_count = 0;

// XBUS PIO UART state (GP28)
// Decoded channel values in microseconds, 1-indexed.
static uint16_t xbus_ch_us[XBUS_MAX_CHANNELS + 1] = {0};
static PIO      xbus_pio;
static uint     xbus_sm;

// Domain 2 state
static uint32_t t0_us         = 0;
static bool     show_running  = false;
static uint32_t active_event_idx  = 0;
static uint32_t prefetch_event_idx = UINT32_MAX;

// Header parsed from flash
static uint32_t flash_event_count  = 0;
static uint32_t flash_pattern_count = 0;

// ─── IR Index ISR (GP14, falling edge) ────────────────────────────────────────
// GP28 is now the XBUS UART RX (PIO-driven) and does not use a GPIO IRQ.

static void ir_index_isr(uint gpio, uint32_t events) {
    if (gpio == GP_IR_INDEX && (events & GPIO_IRQ_EDGE_FALL)) {
        ir_pulse_time_us = time_us_32();
        ir_pulse_flag = true;
    }
}

// ─── XBUS PIO UART helpers ────────────────────────────────────────────────────
// uart_rx_program_init() comes from uart_rx.pio.h and runs the SM at
// 8 × baud (clkdiv computed from sys_clk).

static void xbus_uart_init(void) {
    // SK9822 uses both PIO blocks but only 2 SMs each — pio1 has 2 free SMs.
    xbus_pio = pio1;
    xbus_sm  = (uint)pio_claim_unused_sm(xbus_pio, true);
    uint offset = pio_add_program(xbus_pio, &uart_rx_program);
    uart_rx_program_init(xbus_pio, xbus_sm, offset, GP_XBUS_RX, XBUS_BAUD);
    printf("[xbus] PIO UART RX on GP%d at %u baud (PIO1 SM%u)\n",
           GP_XBUS_RX, (unsigned)XBUS_BAUD, xbus_sm);
}

// Drain PIO RX FIFO and parse 4-byte XBUS records.
// Returns the channel ID of the most-recently updated channel,
// or 0 if no record was completed.
static uint8_t xbus_poll(void) {
    static uint8_t window[4];
    static uint8_t fill = 0;
    uint8_t last_updated = 0;

    while (!pio_sm_is_rx_fifo_empty(xbus_pio, xbus_sm)) {
        uint32_t raw = pio_sm_get(xbus_pio, xbus_sm);
        uint8_t  b   = (uint8_t)(raw >> 24);
        window[fill++] = b;

        while (fill >= 4) {
            bool valid = (window[0] >= 0x01 && window[0] <= 0x16)
                      && (window[1] == 0x00);
            if (!valid) {
                window[0] = window[1];
                window[1] = window[2];
                window[2] = window[3];
                fill = 3;
                break;
            }
            uint8_t  ch_id = window[0];
            uint16_t pos   = ((uint16_t)window[2] << 8) | window[3];
            uint16_t us    = (uint16_t)(800u + ((uint32_t)pos * 1400u + 32767u) / 65535u);
            xbus_ch_us[ch_id] = us;
            last_updated = ch_id;
            fill = 0;
        }
    }
    return last_updated;
}

// ─── Period smoothing (Domain 1) ──────────────────────────────────────────────

static void update_period_estimate(uint32_t now_us) {
    static uint32_t last_pulse_us = 0;
    if (last_pulse_us == 0) {
        last_pulse_us = now_us;
        return;
    }
    uint32_t interval = now_us - last_pulse_us;
    last_pulse_us = now_us;

    // Sanity check: reject intervals outside 1200-4000 RPM range
    if (interval < 15000 || interval > 50000) return;

    period_history[period_history_idx] = interval;
    period_history_idx = (period_history_idx + 1) % PERIOD_SMOOTH_N;
    if (period_history_count < PERIOD_SMOOTH_N) period_history_count++;

    // Rolling average
    uint64_t sum = 0;
    for (uint8_t i = 0; i < period_history_count; i++) sum += period_history[i];
    rev_period_us = (uint32_t)(sum / period_history_count);
}

// ─── Domain 2: show elapsed time ─────────────────────────────────────────────

static inline uint32_t show_elapsed_ms(void) {
    if (!show_running) return 0;
    return (time_us_32() - t0_us) / 1000;
}

// ─── Slice index computation (Domain 1) ───────────────────────────────────────
// slice_idx = floor((now - ir_pulse_time) / rev_period * 180)
// Returns -1 if we've exceeded one revolution (shouldn't fire again until next IR pulse)

static inline int32_t compute_slice(uint32_t now_us) {
    uint32_t elapsed = now_us - ir_pulse_time_us;
    if (elapsed >= rev_period_us) return -1;  // past end of revolution
    // Fixed-point: multiply first to avoid float
    uint32_t idx = (uint64_t)elapsed * SLICES_PER_REV / rev_period_us;
    if (idx >= SLICES_PER_REV) return -1;
    return (int32_t)idx;
}

// ─── Canned cycle renderers ───────────────────────────────────────────────────
// Each renderer fills the active_buf with a full revolution's pixel data.
// Called once per event transition — NOT per revolution.

static void render_solid_color(CannedParams *p) {
    for (uint32_t s = 0; s < SLICES_PER_REV; s++) {
        uint8_t *slice = active_buf + s * PIXELS_PER_BLADE * BYTES_PER_PIXEL;
        for (uint32_t px = 0; px < PIXELS_PER_BLADE; px++) {
            uint8_t *pixel = slice + px * BYTES_PER_PIXEL;
            pixel[0] = 0xE0 | (p->bri & 0x1F);
            pixel[1] = p->b;
            pixel[2] = p->g;
            pixel[3] = p->r;
        }
    }
}

static void render_sweep(CannedParams *p, uint32_t elapsed_ms) {
    // p->param_a = width_deg (arc width of lit region)
    // p->param_b = phase_offset_deg (starting angle)
    uint32_t width_slices = (p->param_a * SLICES_PER_REV) / 360;
    if (width_slices < 1) width_slices = 1;

    // Clear buffer
    memset(active_buf, 0, PATTERN_BUF_BYTES);

    // Light up width_slices consecutive slices starting at phase_offset
    uint32_t start_slice = (p->param_b * SLICES_PER_REV / 360) % SLICES_PER_REV;
    for (uint32_t i = 0; i < width_slices; i++) {
        uint32_t s = (start_slice + i) % SLICES_PER_REV;
        uint8_t *slice = active_buf + s * PIXELS_PER_BLADE * BYTES_PER_PIXEL;
        for (uint32_t px = 0; px < PIXELS_PER_BLADE; px++) {
            uint8_t *pixel = slice + px * BYTES_PER_PIXEL;
            pixel[0] = 0xE0 | (p->bri & 0x1F);
            pixel[1] = p->b;
            pixel[2] = p->g;
            pixel[3] = p->r;
        }
    }
}

static void render_strobe(CannedParams *p, uint32_t elapsed_ms) {
    // p->param_a = on_ms, p->param_b = off_ms
    uint32_t cycle = p->param_a + p->param_b;
    if (cycle == 0) cycle = 1;
    bool lit = (elapsed_ms % cycle) < p->param_a;

    if (lit) {
        render_solid_color(p);
    } else {
        memset(active_buf, 0, PATTERN_BUF_BYTES);
    }
}

static void render_radial_gradient(CannedParams *p) {
    for (uint32_t s = 0; s < SLICES_PER_REV; s++) {
        uint8_t *slice = active_buf + s * PIXELS_PER_BLADE * BYTES_PER_PIXEL;
        for (uint32_t px = 0; px < PIXELS_PER_BLADE; px++) {
            // Lerp from (r,g,b) at hub to (r2,g2,b2) at tip
            uint32_t t = (px * 255) / (PIXELS_PER_BLADE - 1);
            uint8_t r = (uint8_t)((p->r * (255 - t) + p->r2 * t) / 255);
            uint8_t g = (uint8_t)((p->g * (255 - t) + p->g2 * t) / 255);
            uint8_t b = (uint8_t)((p->b * (255 - t) + p->b2 * t) / 255);
            uint8_t *pixel = slice + px * BYTES_PER_PIXEL;
            pixel[0] = 0xE0 | (p->bri & 0x1F);
            pixel[1] = b;
            pixel[2] = g;
            pixel[3] = r;
        }
    }
}

static void render_brightness_fade(CannedParams *p, uint32_t elapsed_ms, uint32_t duration_ms) {
    // p->param_a = bri_start (0-31), p->param_b = bri_end (0-31)
    if (duration_ms == 0) duration_ms = 1;
    uint32_t t = (elapsed_ms * 255) / duration_ms;
    if (t > 255) t = 255;
    uint8_t bri = (uint8_t)((p->param_a * (255 - t) + p->param_b * t) / 255);
    bri &= 0x1F;

    for (uint32_t s = 0; s < SLICES_PER_REV; s++) {
        uint8_t *slice = active_buf + s * PIXELS_PER_BLADE * BYTES_PER_PIXEL;
        for (uint32_t px = 0; px < PIXELS_PER_BLADE; px++) {
            uint8_t *pixel = slice + px * BYTES_PER_PIXEL;
            pixel[0] = 0xE0 | bri;
            pixel[1] = p->b;
            pixel[2] = p->g;
            pixel[3] = p->r;
        }
    }
}

// ─── Pattern loading ──────────────────────────────────────────────────────────

// Load a canned cycle pattern into buf from flash pattern pool
static void load_canned_pattern(uint8_t *buf, uint8_t pattern_idx,
                                 uint32_t elapsed_ms, uint32_t duration_ms) {
    // Each pattern pool entry: u16 LE length + JSON bytes
    // We parse only the fields we need via a tiny hand-written parser
    // For robustness, fall back to solid white if parse fails

    // Find the pattern entry offset in flash
    uint32_t pool_addr = PATTERN_POOL_FLASH_OFFSET;
    uint16_t entry_len = 0;
    for (uint8_t i = 0; i <= pattern_idx; i++) {
        uint8_t len_bytes[2];
        if (!flash_read(pool_addr, len_bytes, 2)) goto fallback;
        entry_len = (uint16_t)(len_bytes[0] | (len_bytes[1] << 8));
        if (i < pattern_idx) pool_addr += 2 + entry_len;
    }

    // Read JSON entry (max 512 bytes — canned params are small)
    uint8_t json_buf[512];
    if (entry_len > sizeof(json_buf)) goto fallback;
    if (!flash_read(pool_addr + 2, json_buf, entry_len)) goto fallback;
    json_buf[entry_len] = '\0';

    // Minimal JSON field extraction — find "fn_id", "r", "g", "b", "bri", params
    // Using strstr for simplicity — sufficient for our controlled JSON format
    CannedParams params = {0};
    params.bri = 16; // default half brightness

    char *fn_ptr = strstr((char*)json_buf, "\"fn_id\":");
    if (fn_ptr) params.fn_id = (uint8_t)atoi(fn_ptr + 8);

    char *r_ptr = strstr((char*)json_buf, "\"r\":");
    if (r_ptr) params.r = (uint8_t)atoi(r_ptr + 4);

    char *g_ptr = strstr((char*)json_buf, "\"g\":");
    if (g_ptr) params.g = (uint8_t)atoi(g_ptr + 4);

    char *b_ptr = strstr((char*)json_buf, "\"b\":");
    if (b_ptr) params.b = (uint8_t)atoi(b_ptr + 4);

    char *bri_ptr = strstr((char*)json_buf, "\"bri\":");
    if (bri_ptr) params.bri = (uint8_t)atoi(bri_ptr + 6) & 0x1F;

    char *pa_ptr = strstr((char*)json_buf, "\"param_a\":");
    if (pa_ptr) params.param_a = (uint32_t)atoi(pa_ptr + 10);

    char *pb_ptr = strstr((char*)json_buf, "\"param_b\":");
    if (pb_ptr) params.param_b = (uint32_t)atoi(pb_ptr + 10);

    // Render into buf (temporarily point active_buf at buf)
    uint8_t *saved = active_buf;
    active_buf = buf;

    switch (params.fn_id) {
        case FN_SOLID_COLOR:     render_solid_color(&params); break;
        case FN_SWEEP:           render_sweep(&params, elapsed_ms); break;
        case FN_STROBE:          render_strobe(&params, elapsed_ms); break;
        case FN_RADIAL_GRADIENT: render_radial_gradient(&params); break;
        case FN_BRIGHTNESS_FADE: render_brightness_fade(&params, elapsed_ms, duration_ms); break;
        default:                 goto restore_fallback;
    }

    active_buf = saved;
    return;

restore_fallback:
    active_buf = saved;
fallback:
    // Solid white at half brightness — always visible, always safe
    CannedParams safe = { .fn_id = FN_SOLID_COLOR, .r=255, .g=255, .b=255, .bri=16 };
    uint8_t *saved2 = active_buf;
    active_buf = buf;
    render_solid_color(&safe);
    active_buf = saved2;
}

// Load a pre-rendered image strip from flash image data region
// img_flash_offset: absolute flash address of the 51840-byte polar strip
static void load_image_pattern(uint8_t *buf, uint32_t img_flash_offset) {
    // DMA the full pattern buffer directly from external flash
    // This takes ~5ms at SPI clock — must be called between revolutions
    flash_read(img_flash_offset, buf, PATTERN_BUF_BYTES);
}

// ─── Event management (Domain 2) ──────────────────────────────────────────────

static void activate_event(uint32_t idx) {
    if (idx >= event_count) return;
    active_event_idx = idx;
    uint32_t elapsed = show_elapsed_ms() - event_table[idx].start_ms;
    load_canned_pattern(active_buf, event_table[idx].pattern_idx,
                        elapsed, event_table[idx].duration_ms);
}

static void prefetch_event(uint32_t idx) {
    if (idx >= event_count) return;
    if (idx == prefetch_event_idx) return;
    prefetch_event_idx = idx;
    // Load into prefetch buffer in background
    // In a real multi-core build this would run on Core 1
    // For now: load synchronously — this is called at event start
    // so we have ~one full revolution of time before the next one
    load_canned_pattern(prefetch_buf, event_table[idx].pattern_idx,
                        0, event_table[idx].duration_ms);
}

static void swap_buffers(void) {
    uint8_t *tmp = active_buf;
    active_buf = prefetch_buf;
    prefetch_buf = tmp;
    prefetch_event_idx = UINT32_MAX;
}

static void update_active_event(uint32_t now_ms) {
    if (event_count == 0) return;

    // Find which event should be active
    uint32_t target_idx = 0;
    for (uint32_t i = 0; i < event_count; i++) {
        if (event_table[i].start_ms <= now_ms) {
            target_idx = i;
        } else {
            break;
        }
    }

    if (target_idx == active_event_idx) {
        // Still in same event — check if we need to re-render
        // (for time-varying canned cycles like strobe, re-render every revolution)
        uint8_t fn = 0; // TODO: cache fn_id to avoid flash read
        // For now: always re-render canned cycles (they're fast)
        load_canned_pattern(active_buf, event_table[active_event_idx].pattern_idx,
            now_ms - event_table[active_event_idx].start_ms,
            event_table[active_event_idx].duration_ms);
        return;
    }

    // Event transition
    if (prefetch_event_idx == target_idx) {
        // Prefetch ready — atomic swap
        swap_buffers();
        active_event_idx = target_idx;
    } else {
        // No prefetch — load directly
        activate_event(target_idx);
    }

    // Prefetch next event
    if (target_idx + 1 < event_count) {
        prefetch_event(target_idx + 1);
    }
}

// ─── PIO / DMA output ────────────────────────────────────────────────────────

// fire_slice: sends one slice's worth of pixel data to all 4 PIO lanes
// This is a memory read + DMA kick — no computation
// Called from the tight Core 0 loop every time slice_idx advances

// fire_slice: sends one slice's pixel data to all 4 PIO lanes via DMA.
// Called from the tight Core 0 loop every time slice_idx advances.
static void fire_slice(uint32_t slice_idx) {
    if (slice_idx >= SLICES_PER_REV) return;

    // Each slice in the pattern buffer has PIXELS_PER_BLADE (72) pixels.
    // Split into 4 segments of PIXELS_PER_SEGMENT (36) each.
    // Layout in active_buf:
    //   slice_base + 0*36*4  → Seg1 Top  (lane 0)
    //   slice_base + 1*36*4  → Seg2 Top  (lane 1)
    //   slice_base + 2*36*4  → Seg1 Bot  (lane 2)
    //   slice_base + 3*36*4  → Seg2 Bot  (lane 3)

    const uint8_t *slice_base = active_buf +
        slice_idx * PIXELS_PER_BLADE * BYTES_PER_PIXEL;

    sk9822_pio_write_slice(slice_base);
    sk9822_pio_wait();
}

// ─── Public API ───────────────────────────────────────────────────────────────

void player_init(void) {
    // Clear pattern buffers
    memset(pattern_buf_a, 0, sizeof(pattern_buf_a));
    memset(pattern_buf_b, 0, sizeof(pattern_buf_b));
    active_buf   = pattern_buf_a;
    prefetch_buf = pattern_buf_b;

    // IR index input with interrupt on falling edge (TSSP77038 active-low).
    gpio_init(GP_IR_INDEX);
    gpio_set_dir(GP_IR_INDEX, GPIO_IN);
    gpio_pull_up(GP_IR_INDEX);
    gpio_set_irq_enabled_with_callback(GP_IR_INDEX, GPIO_IRQ_EDGE_FALL, true, ir_index_isr);

    // Initialise period history with a reasonable default (2100 RPM)
    for (uint8_t i = 0; i < PERIOD_SMOOTH_N; i++) period_history[i] = 28571;
    period_history_count = PERIOD_SMOOTH_N;

    // Initialise SK9822 PIO state machines and DMA channels first — this
    // loads the SK9822 program into both pio0 and pio1 and claims 4 SMs.
    sk9822_pio_init();

    // XBUS PIO UART on GP28 — uses a free SM on pio1.
    xbus_uart_init();

    printf("[player] init done. Pattern buffers: 2 x %d bytes\n", PATTERN_BUF_BYTES);
}

bool player_load_show(void) {
    // Read JSON header from flash (first 4KB)
    uint8_t header_buf[256];
    if (!flash_read(0x000000, header_buf, sizeof(header_buf))) {
        printf("[player] flash read header failed\n");
        return false;
    }

    // Parse eventCount from header JSON
    char *ec_ptr = strstr((char*)header_buf, "\"eventCount\":");
    if (!ec_ptr) {
        printf("[player] header parse failed — no eventCount\n");
        return false;
    }
    flash_event_count = (uint32_t)atoi(ec_ptr + 13);
    if (flash_event_count > MAX_EVENTS) flash_event_count = MAX_EVENTS;
    event_count = flash_event_count;

    printf("[player] loading %lu events from flash\n", event_count);

    // Cache full event table into SRAM
    uint8_t raw[EVENT_ENTRY_BYTES];
    for (uint32_t i = 0; i < event_count; i++) {
        uint32_t addr = EVENT_TABLE_FLASH_OFFSET + i * EVENT_ENTRY_BYTES;
        if (!flash_read(addr, raw, EVENT_ENTRY_BYTES)) {
            printf("[player] event table read failed at idx %lu\n", i);
            event_count = i;
            break;
        }
        event_table[i].start_ms    = (uint32_t)(raw[0] | raw[1]<<8 | raw[2]<<16 | raw[3]<<24);
        event_table[i].duration_ms = (uint32_t)(raw[4] | raw[5]<<8 | raw[6]<<16 | raw[7]<<24);
        event_table[i].type        = raw[8];
        event_table[i].pattern_idx = raw[9];
    }

    printf("[player] event table cached. %lu events ready.\n", event_count);

    // Pre-render first event into active buffer
    if (event_count > 0) {
        load_canned_pattern(active_buf, event_table[0].pattern_idx, 0,
                            event_table[0].duration_ms);
        // Prefetch second event
        if (event_count > 1) {
            prefetch_event(1);
        }
    }

    return true;
}

void player_start(uint32_t t0_ms) {
    t0_us = (uint64_t)t0_ms * 1000 + time_us_32() - (time_us_32() % 1000);
    // Simpler: just use current time as t0
    t0_us = time_us_32() - (uint64_t)t0_ms * 1000;
    show_running = true;
    active_event_idx = 0;
    printf("[player] show started. t0_us=%lu\n", t0_us);
}

void player_stop(void) {
    show_running = false;
    // Hold last frame — don't clear active_buf
    printf("[player] show stopped\n");
}

// ─── Core 0 tight loop — call this continuously ────────────────────────────────

void player_run(void) {
    uint32_t last_fired = UINT32_MAX;

    // Show-state debounce counters (consecutive published CH6 records)
    static int ch6_high_count = 0;
    static int ch6_low_count  = 0;

    while (true) {
        uint32_t now = time_us_32();

        // ── XBUS show trigger (CH6) + bailout (CH8) ──────────────────
        if (xbus_poll() != 0) {
            uint16_t ch6 = xbus_ch_us[6];
            uint16_t ch8 = xbus_ch_us[8];

            // CH8 bailout — immediate, no debounce
            if (ch8 > XBUS_BAILOUT_THRESH && show_running) {
                player_stop();
                printf("[xbus] BAILOUT ch8=%u\n", ch8);
                ch6_high_count = 0;
                ch6_low_count  = 0;
            }

            // CH6 debounced start/stop
            if (ch6 > XBUS_START_THRESH) {
                if (++ch6_high_count >= XBUS_DEBOUNCE_RECS && !show_running) {
                    player_start(0);
                    printf("[xbus] show START ch6=%u\n", ch6);
                }
                ch6_low_count = 0;
            } else if (ch6 < XBUS_STOP_THRESH) {
                if (++ch6_low_count >= XBUS_DEBOUNCE_RECS && show_running) {
                    player_stop();
                    printf("[xbus] show STOP ch6=%u\n", ch6);
                }
                ch6_high_count = 0;
            } else {
                ch6_high_count = 0;
                ch6_low_count  = 0;
            }
        }

        // ── IR pulse received ────────────────────────────────────────
        if (ir_pulse_flag) {
            uint32_t pulse_time = ir_pulse_time_us; // capture before clearing
            ir_pulse_flag = false;

            // Domain 1: update period estimate
            update_period_estimate(pulse_time);

            // Domain 2: update active event (wall-clock, never RPM-corrected)
            if (show_running) {
                uint32_t now_ms = show_elapsed_ms();
                update_active_event(now_ms);
            }

            // Reset slice tracking for new revolution
            last_fired = UINT32_MAX;
        }

        // ── Domain 1: angle-driven slice firing ──────────────────────
        if (!show_running) {
            tight_loop_contents();
            continue;
        }

        int32_t target = compute_slice(now);

        // -1 means we're past one full revolution — wait for next IR pulse
        if (target < 0) {
            tight_loop_contents();
            continue;
        }

        // Same slice as last fired — nothing to do
        if ((uint32_t)target == last_fired) {
            tight_loop_contents();
            continue;
        }

        // New slice — fire it
        // NOTE: if slices were skipped (rotor running fast), we skip them silently
        // No catchup loop. Ever.
        fire_slice((uint32_t)target);
        last_fired = (uint32_t)target;
    }
}
