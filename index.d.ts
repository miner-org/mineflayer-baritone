import { Goal } from "./src/goal";
import { Vec3 } from "vec3";
import { Cell } from "./src/pathfinder";
declare module "mineflayer" {
  interface Bot {
    ashfinder: {
      config: {
        /**
         * Blocks to avoid breaking
         */
        blocksToAvoid: string[];

        /**
         * Blocks to not get near
         */
        blocksToStayAway: string[];

        /**
         * Radius to avoid blocks in `blocksToStayAway`
         */
        avoidDistance: number;

        swimming: boolean;
        placeBlocks: boolean;
        breakBlocks: boolean;
        parkour: boolean;
        proParkour: boolean;

        /**
         * Try to break blocks above target if needed
         */
        checkBreakUpNodes: boolean;

        fly: boolean;

        /**
         * How many blocks the bot can go down
         */
        maxFallDist: number;

        /**
         * How far the bot can jump down into a water source
         */
        maxWaterDist: number;

        /**
         * Blocks that can be used for placing
         */
        disposableBlocks: string[];

        /**
         * Blocks the bot can interact with
         */
        interactableBlocks: string[];

        /**
         * The time the bot uses to think of a path
         */
        thinkTimeout: number;
      };

      debug: boolean;
      stopped: boolean;
      path: Cell[]; // Add type or import as needed

      goto(goal: Goal, excludedPositions?: Vec3[]): Promise<void>;

      stop(): void;

      follow(
        entity: Entity,
        options?: { minDistance?: number; maxDistance?: number }
      ): Promise<void>;

      generatePath(position: Vec3): { path: Cell[]; cost: number };
    };
  }
}

declare module "@miner-org/mineflayer-baritone" {
  import { Bot } from "mineflayer";
  import { Vec3 } from "vec3";

  export class Goal {
    position: Vec3;
    x: number;
    y: number;
    z: number;

    constructor(position: Vec3);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalNear extends Goal {
    distance: number;

    constructor(position: Vec3, distance: number);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalExact extends Goal {
    constructor(position: Vec3);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalYLevel extends Goal {
    constructor(position: Vec3);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalRegion extends Goal {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;

    constructor(position1: Vec3, position2: Vec3);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalAvoid extends Goal {
    minDistance: number;

    constructor(position: Vec3, minDistance: number);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalComposite extends Goal {
    goals: Goal[];
    mode: "all" | "any";

    constructor(goals: Goal[], mode?: "all" | "any");
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalInvert extends Goal {
    goal: Goal;

    constructor(goal: Goal);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalXZ extends Goal {
    constructor(position: Vec3);
    isReached(otherPosition: Vec3): boolean;
  }

  export class GoalXZNear extends Goal {
    distance: number;

    constructor(position: Vec3, distance: number);
    isReached(otherPosition: Vec3): boolean;
  }

  export function loader(bot: Bot): void;

  export const goals: {
    Goal: typeof Goal;
    GoalNear: typeof GoalNear;
    GoalExact: typeof GoalExact;
    GoalYLevel: typeof GoalYLevel;
    GoalRegion: typeof GoalRegion;
    GoalAvoid: typeof GoalAvoid;
    GoalComposite: typeof GoalComposite;
    GoalInvert: typeof GoalInvert;
    GoalXZ: typeof GoalXZ;
    GoalXZNear: typeof GoalXZNear;
  };
}
