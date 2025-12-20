declare module "three/examples/jsm/loaders/OBJLoader" {
  import { Loader } from "three";
  import { Group } from "three";
  export class OBJLoader extends Loader {
    load(
      url: string,
      onLoad: (object: Group) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}

declare module "three/examples/jsm/loaders/MTLLoader" {
  import { Loader } from "three";
  import { MaterialCreator } from "three";
  export class MTLLoader extends Loader {
    load(
      url: string,
      onLoad: (materialCreator: MaterialCreator) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}