// firmware/fuselage/src/player.c
// SYNCHRON Fuselage Controller — Show Player
//
// Single time domain only (Domain 2 — no angular/POV rendering).
// Drives up to 4 independent WS2812B zones via PIO.
// Smoke pump servo output on GP14.
// 38kHz IR LED always-on on GP28 via MOSFET.
//
// Memory: fuselage show files are tiny (<100KB). No double-buffer needed.
// Full event table + all canned cycle params fit comfortably in SRAM.

#include "player.h"
#include "ws2812_driver.h"
#include "common/flash_if.h"
#include "pico/stdlib.h"
#include "hardware/pwm.h"
#include "hardware/gpio.h"
#include "hardware/clocks.h"
#include <string.h>
#include <stdio.h>

// ─── Constants ────────────────────────────────────────────────────────────────

// GPIO assignments (from HW_PINS_FUSELAGE.md)
#define GP_CH1_OUT          3    // WS2812B Zone 1 (canopy)
#define GP_CH2_OUT          2    // WS2812B Zone 2 (tail)
#define GP_CH3_OUT          4    // WS2812B Zone 3
#define GP_CH4_OUT          5    // WS2812B Zone 4
#define GP_SMOKE_OUT        14   // Servo PWM output
#define GP_RC_INPUT         15   // RC PWM input (show start)
#define GP_IR_OUT           28   // 38kHz IR LED via MOSFET

// Zone pixel counts (from model config — default values, overridden by flash header)
#define MAX_PIXELS_PER_ZONE 300
#define MAX_ZONES           4

// Flash layout (same as blade)
#define EVENT_TABLE_FLASH_OFFSET    0x001000
#define PATTERN_POOL_FLASH_OFFSET   0x003000
#define EVENT_ENTRY_BYTES           10
#define MAX_EVENTS                  819

// Servo PWM: 50Hz, 1000-2000µs pulse width
#define SERVO_FREQ_HZ       50
#define SERVO_MIN_US        1000
#define SERVO_MAX_US        2000

// IR carrier: 38kHz, 50% duty cycle
#define IR_FREQ_HZ          38000

// Event types
#define EVENT_TYPE_FUSELAGE 0x01
#define EVENT_TYPE_BLADE    0x02
#define EVENT_TYPE_BOTH     0x03

// Fuselage function IDs
#define FN_SOLID_COLOR      0x01
#define FN_PIXEL_TRAVEL     0x02
#define FN_CHASE            0x03
#define FN_BRIGHTNESS_PULSE 0x04
#define FN_STROBE           0x05
#define FN_RAINBOW_FADE     0x06
#define FN_COLOR_WIPE       0x07

// ─── Types ────────────────────────────────────────────────────────────────────

typedef struct {
    uint32_t start_ms;
    uint32_t duration_ms;
    uint8_t  type;
    uint8_t  pattern_idx;
} EventEntry;

typedef struct {
    uint8_t  fn_id;
    uint8_t  target_zone;   // 0=all, 1-4=specific zone
    uint8_t  r, g, b;
    uint8_t  bri;           // 0-31 for SK9822, scaled 0-255 for WS2812B
    uint32_t param_a;       // fn-specific
    uint32_t param_b;       // fn-specific
    uint32_t param_c;       // fn-specific
} FuseParams;

typedef struct {
    bool     active;
    uint32_t start_ms;      // when this event became active
    FuseParams params;
} ActiveEvent;

// ─── Zone pixel buffers ───────────────────────────────────────────────────────
// Each zone: up to MAX_PIXELS_PER_ZONE pixels × 3 bytes (GRB for WS2812B)
// 4 zones × 300px × 3 = 3,600 bytes — trivially small

static uint8_t zone_buf[MAX_ZONES][MAX_PIXELS_PER_ZONE * 3];
static uint32_t zone_pixel_count[MAX_ZONES] = {60, 120, 0, 0}; // defaults

static const uint8_t zone_gpio[MAX_ZONES] = {
    GP_CH1_OUT, GP_CH2_OUT, GP_CH3_OUT, GP_CH4_OUT
};

// ─── Event storage ────────────────────────────────────────────────────────────

static EventEntry event_table[MAX_EVENTS];
static uint32_t   event_count = 0;

// Multiple events can be active simultaneously on different zones
#define MAX_ACTIVE_EVENTS 8
static ActiveEvent active_events[MAX_ACTIVE_EVENTS];

// ─── Timing ───────────────────────────────────────────────────────────────────

static uint32_t t0_us       = 0;
static bool     show_running = false;

static inline uint32_t show_elapsed_ms(void) {
    if (!show_running) return 0;
    return (time_us_32() - t0_us) / 1000;
}

// ─── IR LED (38kHz always-on) ─────────────────────────────────────────────────

static void ir_led_init(void) {
    // Use hardware PWM for 38kHz on GP28
    gpio_set_function(GP_IR_OUT, GPIO_FUNC_PWM);
    uint slice = pwm_gpio_to_slice_num(GP_IR_OUT);
    uint chan  = pwm_gpio_to_channel(GP_IR_OUT);

    // sys_clk = 125MHz, wrap = 125MHz/38kHz = 3289
    uint32_t sys_clk = clock_get_hz(clk_sys);
    uint32_t wrap = sys_clk / IR_FREQ_HZ;
    pwm_set_wrap(slice, wrap - 1);
    pwm_set_chan_level(slice, chan, wrap / 2); // 50% duty
    pwm_set_enabled(slice, true);

    printf("[fuselage] IR LED 38kHz started on GP%d\n", GP_IR_OUT);
}

// ─── Servo output ─────────────────────────────────────────────────────────────

static uint servo_slice;
static uint servo_chan;
static uint32_t servo_wrap;

static void servo_init(void) {
    gpio_set_function(GP_SMOKE_OUT, GPIO_FUNC_PWM);
    servo_slice = pwm_gpio_to_slice_num(GP_SMOKE_OUT);
    servo_chan  = pwm_gpio_to_channel(GP_SMOKE_OUT);

    // 50Hz: wrap = 125MHz / (50Hz * divider)
    // Use divider=64 for 50Hz: wrap = 125,000,000 / (50*64) = 39,062
    pwm_config cfg = pwm_get_default_config();
    pwm_config_set_clkdiv(&cfg, 64.0f);
    pwm_init(servo_slice, &cfg, false);
    servo_wrap = clock_get_hz(clk_sys) / (SERVO_FREQ_HZ * 64);
    pwm_set_wrap(servo_slice, servo_wrap - 1);

    // Default: 1500µs (neutral)
    uint32_t level = (uint32_t)((1500ULL * servo_wrap * SERVO_FREQ_HZ) / 1000000);
    pwm_set_chan_level(servo_slice, servo_chan, level);
    pwm_set_enabled(servo_slice, true);

    printf("[fuselage] servo init on GP%d\n", GP_SMOKE_OUT);
}

static void servo_set_us(uint32_t pulse_us) {
    if (pulse_us < SERVO_MIN_US) pulse_us = SERVO_MIN_US;
    if (pulse_us > SERVO_MAX_US) pulse_us = SERVO_MAX_US;
    uint32_t level = (uint32_t)((pulse_us * (uint64_t)servo_wrap * SERVO_FREQ_HZ) / 1000000);
    pwm_set_chan_level(servo_slice, servo_chan, level);
}

// ─── WS2812B zone pixel helpers ───────────────────────────────────────────────

static void zone_set_all(uint8_t zone, uint8_t r, uint8_t g, uint8_t b) {
    if (zone >= MAX_ZONES) return;
    uint32_t count = zone_pixel_count[zone];
    uint8_t *buf = zone_buf[zone];
    for (uint32_t i = 0; i < count; i++) {
        buf[i*3+0] = g; // WS2812B is GRB
        buf[i*3+1] = r;
        buf[i*3+2] = b;
    }
}

static void zone_set_pixel(uint8_t zone, uint32_t px, uint8_t r, uint8_t g, uint8_t b) {
    if (zone >= MAX_ZONES || px >= zone_pixel_count[zone]) return;
    uint8_t *buf = zone_buf[zone];
    buf[px*3+0] = g;
    buf[px*3+1] = r;
    buf[px*3+2] = b;
}

static void zone_clear(uint8_t zone) {
    if (zone >= MAX_ZONES) return;
    memset(zone_buf[zone], 0, zone_pixel_count[zone] * 3);
}

// ─── Canned cycle renderers ───────────────────────────────────────────────────

static void render_solid_color(uint8_t zone, FuseParams *p) {
    zone_set_all(zone, p->r, p->g, p->b);
}

static void render_chase(uint8_t zone, FuseParams *p, uint32_t elapsed_ms) {
    // p->param_a = window_px (lit window width)
    // p->param_b = speed_px_per_sec
    uint32_t count = zone_pixel_count[zone];
    if (count == 0) return;
    uint32_t window = p->param_a ? p->param_a : 3;
    uint32_t total_pixels = count + window; // wraps
    uint32_t px_per_sec = p->param_b ? p->param_b : 30;
    uint32_t head = (uint32_t)((uint64_t)elapsed_ms * px_per_sec / 1000) % total_pixels;

    zone_clear(zone);
    for (uint32_t i = 0; i < window; i++) {
        uint32_t px = (head + i) % count;
        zone_set_pixel(zone, px, p->r, p->g, p->b);
    }
}

static void render_strobe(uint8_t zone, FuseParams *p, uint32_t elapsed_ms) {
    uint32_t cycle = p->param_a + p->param_b;
    if (cycle == 0) cycle = 100;
    bool lit = (elapsed_ms % cycle) < p->param_a;
    if (lit) {
        zone_set_all(zone, p->r, p->g, p->b);
    } else {
        zone_clear(zone);
    }
}

static void render_brightness_pulse(uint8_t zone, FuseParams *p, uint32_t elapsed_ms) {
    // Sinusoidal brightness pulse tied to BPM
    // p->param_a = bpm, p->param_b = bri_peak (0-255), p->param_c = bri_floor (0-255)
    uint32_t bpm = p->param_a ? p->param_a : 120;
    uint32_t ms_per_beat = 60000 / bpm;
    // sin approximation: triangle wave for efficiency
    uint32_t phase = elapsed_ms % ms_per_beat;
    uint32_t half = ms_per_beat / 2;
    uint32_t tri = (phase < half) ? (phase * 255 / half) : ((ms_per_beat - phase) * 255 / half);
    uint32_t peak  = p->param_b ? p->param_b : 255;
    uint32_t floor_ = p->param_c;
    uint32_t bri = floor_ + (tri * (peak - floor_)) / 255;
    uint8_t  r = (uint8_t)(p->r * bri / 255);
    uint8_t  g = (uint8_t)(p->g * bri / 255);
    uint8_t  b = (uint8_t)(p->b * bri / 255);
    zone_set_all(zone, r, g, b);
}

static void render_rainbow_fade(uint8_t zone, uint32_t elapsed_ms, uint32_t cycle_ms) {
    if (cycle_ms == 0) cycle_ms = 4000;
    uint32_t count = zone_pixel_count[zone];
    uint32_t hue_base = (elapsed_ms * 360 / cycle_ms) % 360;
    for (uint32_t px = 0; px < count; px++) {
        uint32_t hue = (hue_base + px * 360 / count) % 360;
        // HSV → RGB (S=V=1)
        uint32_t hi = hue / 60;
        uint32_t f  = (hue % 60) * 255 / 60;
        uint8_t r=0, g=0, b=0;
        switch (hi) {
            case 0: r=255; g=f;   b=0;   break;
            case 1: r=255-f; g=255; b=0;  break;
            case 2: r=0;   g=255; b=f;   break;
            case 3: r=0;   g=255-f; b=255; break;
            case 4: r=f;   g=0;   b=255; break;
            default: r=255; g=0;   b=255-f; break;
        }
        zone_set_pixel(zone, px, r, g, b);
    }
}

static void render_color_wipe(uint8_t zone, FuseParams *p, uint32_t elapsed_ms) {
    // p->param_a = fill_ms (time to fill full zone)
    uint32_t fill_ms = p->param_a ? p->param_a : 1000;
    uint32_t count = zone_pixel_count[zone];
    uint32_t filled = (elapsed_ms * count) / fill_ms;
    if (filled > count) filled = count;
    zone_clear(zone);
    for (uint32_t px = 0; px < filled; px++) {
        zone_set_pixel(zone, px, p->r, p->g, p->b);
    }
}

// ─── Pattern loading ──────────────────────────────────────────────────────────

static bool load_pattern_params(uint8_t pattern_idx, FuseParams *out) {
    memset(out, 0, sizeof(*out));
    out->bri = 16;

    uint32_t pool_addr = PATTERN_POOL_FLASH_OFFSET;
    uint16_t entry_len = 0;
    for (uint8_t i = 0; i <= pattern_idx; i++) {
        uint8_t len_bytes[2];
        if (!flash_read(pool_addr, len_bytes, 2)) return false;
        entry_len = (uint16_t)(len_bytes[0] | (len_bytes[1] << 8));
        if (i < pattern_idx) pool_addr += 2 + entry_len;
    }

    uint8_t json_buf[512];
    if (entry_len > sizeof(json_buf) - 1) return false;
    if (!flash_read(pool_addr + 2, json_buf, entry_len)) return false;
    json_buf[entry_len] = '\0';

    char *p;
    if ((p = strstr((char*)json_buf, "\"fn_id\":")))     out->fn_id      = (uint8_t)atoi(p+8);
    if ((p = strstr((char*)json_buf, "\"zone\":")))      out->target_zone = (uint8_t)atoi(p+7);
    if ((p = strstr((char*)json_buf, "\"r\":")))         out->r          = (uint8_t)atoi(p+4);
    if ((p = strstr((char*)json_buf, "\"g\":")))         out->g          = (uint8_t)atoi(p+4);
    if ((p = strstr((char*)json_buf, "\"b\":")))         out->b          = (uint8_t)atoi(p+4);
    if ((p = strstr((char*)json_buf, "\"bri\":")))       out->bri        = (uint8_t)atoi(p+6);
    if ((p = strstr((char*)json_buf, "\"param_a\":")))   out->param_a    = (uint32_t)atoi(p+10);
    if ((p = strstr((char*)json_buf, "\"param_b\":")))   out->param_b    = (uint32_t)atoi(p+10);
    if ((p = strstr((char*)json_buf, "\"param_c\":")))   out->param_c    = (uint32_t)atoi(p+10);
    return true;
}

// ─── Active event management ──────────────────────────────────────────────────

static void apply_event(uint32_t event_idx, uint32_t now_ms) {
    EventEntry *ev = &event_table[event_idx];
    if (!(ev->type & EVENT_TYPE_FUSELAGE)) return;

    // Find a free active event slot
    int slot = -1;
    for (int i = 0; i < MAX_ACTIVE_EVENTS; i++) {
        if (!active_events[i].active) { slot = i; break; }
    }
    if (slot < 0) {
        // Evict oldest
        slot = 0;
        uint32_t oldest = active_events[0].start_ms;
        for (int i = 1; i < MAX_ACTIVE_EVENTS; i++) {
            if (active_events[i].start_ms < oldest) {
                oldest = active_events[i].start_ms;
                slot = i;
            }
        }
    }

    active_events[slot].active   = true;
    active_events[slot].start_ms = ev->start_ms;
    load_pattern_params(ev->pattern_idx, &active_events[slot].params);
}

static void tick_active_events(uint32_t now_ms) {
    for (int i = 0; i < MAX_ACTIVE_EVENTS; i++) {
        if (!active_events[i].active) continue;
        FuseParams *p = &active_events[i].params;
        uint32_t elapsed = now_ms - active_events[i].start_ms;
        uint8_t zone = p->target_zone > 0 ? p->target_zone - 1 : 0;

        switch (p->fn_id) {
            case FN_SOLID_COLOR:      render_solid_color(zone, p); break;
            case FN_CHASE:            render_chase(zone, p, elapsed); break;
            case FN_STROBE:           render_strobe(zone, p, elapsed); break;
            case FN_BRIGHTNESS_PULSE: render_brightness_pulse(zone, p, elapsed); break;
            case FN_COLOR_WIPE:       render_color_wipe(zone, p, elapsed); break;
            case FN_RAINBOW_FADE:     render_rainbow_fade(zone, elapsed, p->param_a); break;
            default: break;
        }
    }
}

static void flush_zones(void) {
    for (uint8_t z = 0; z < MAX_ZONES; z++) {
        if (zone_pixel_count[z] == 0) continue;
        ws2812_send(zone_gpio[z], zone_buf[z], zone_pixel_count[z]);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

void player_init(void) {
    memset(zone_buf, 0, sizeof(zone_buf));
    memset(active_events, 0, sizeof(active_events));

    ir_led_init();
    servo_init();
    ws2812_init_all();

    printf("[fuselage player] init done\n");
}

bool player_load_show(void) {
    uint8_t header_buf[256];
    if (!flash_read(0x000000, header_buf, sizeof(header_buf))) return false;

    char *ec_ptr = strstr((char*)header_buf, "\"eventCount\":");
    if (!ec_ptr) return false;
    uint32_t total = (uint32_t)atoi(ec_ptr + 13);
    if (total > MAX_EVENTS) total = MAX_EVENTS;
    event_count = total;

    // Parse zone pixel counts from header if present
    char *z1 = strstr((char*)header_buf, "\"zone1Pixels\":");
    char *z2 = strstr((char*)header_buf, "\"zone2Pixels\":");
    if (z1) zone_pixel_count[0] = (uint32_t)atoi(z1 + 14);
    if (z2) zone_pixel_count[1] = (uint32_t)atoi(z2 + 14);

    printf("[fuselage player] loading %lu events\n", event_count);

    uint8_t raw[EVENT_ENTRY_BYTES];
    uint32_t loaded = 0;
    for (uint32_t i = 0; i < event_count; i++) {
        uint32_t addr = EVENT_TABLE_FLASH_OFFSET + i * EVENT_ENTRY_BYTES;
        if (!flash_read(addr, raw, EVENT_ENTRY_BYTES)) break;
        event_table[i].start_ms    = (uint32_t)(raw[0]|raw[1]<<8|raw[2]<<16|raw[3]<<24);
        event_table[i].duration_ms = (uint32_t)(raw[4]|raw[5]<<8|raw[6]<<16|raw[7]<<24);
        event_table[i].type        = raw[8];
        event_table[i].pattern_idx = raw[9];
        loaded++;
    }
    event_count = loaded;

    printf("[fuselage player] %lu events loaded\n", event_count);
    return event_count > 0;
}

void player_start(uint32_t t0_ms) {
    t0_us = time_us_32() - (uint64_t)t0_ms * 1000;
    show_running = true;
    memset(active_events, 0, sizeof(active_events));
    printf("[fuselage player] show started\n");
}

void player_stop(void) {
    show_running = false;
    printf("[fuselage player] show stopped\n");
}

void player_run(void) {
    uint32_t last_event_check_ms = 0;
    uint32_t next_event_idx = 0;

    while (true) {
        if (!show_running) {
            sleep_us(500);
            continue;
        }

        uint32_t now_ms = show_elapsed_ms();

        // Scan for newly active events
        while (next_event_idx < event_count &&
               event_table[next_event_idx].start_ms <= now_ms) {
            apply_event(next_event_idx, now_ms);
            next_event_idx++;
        }

        // Deactivate expired events
        for (int i = 0; i < MAX_ACTIVE_EVENTS; i++) {
            if (!active_events[i].active) continue;
            // Find this event in the table to get duration
            // (simplified: we store start_ms, duration would need table lookup)
            // For now: events run until replaced by a new event on the same zone
        }

        // Tick all active canned cycles and write to zone buffers
        tick_active_events(now_ms);

        // Flush zone buffers to WS2812B strips via PIO
        flush_zones();

        // ~2kHz loop rate — 500µs is well above WS2812B update requirement
        sleep_us(500);
    }
}
