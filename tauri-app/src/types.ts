export interface GameInstance {
  id: string;
  name: string;
  loader: string;
  minecraftVersion: string;
  color: string;
  modCount: string;
  lastPlayed: string;
  playtime: string;
  status: string;
  summary: string;
  details: string;
}

export interface SettingsItem {
  label: string;
  value: string;
  hint: string;
  editType?: "toggle" | "slider";
}

export interface SettingsSection {
  title: string;
  description: string;
  items: SettingsItem[];
}

export interface LoaderOption {
  id: string;
  label: string;
  description: string;
  color: string;
}

export type NavFrame =
  | { id: "home" }
  | { id: "library" }
  | { id: "settings" }
  | { id: "create" }
  | { id: "account" }
  | { id: "instance"; instanceId: string };

export interface McAccount {
  mcUsername: string;
  mcUuid: string;
  mcAccessToken: string;
  expiresAt: number;
}

export type CreateStep = "loader" | "version" | "color" | "confirm";

export type HapticGamepad = Gamepad & {
  id: string;
  index: number;
  vibrationActuator?: {
    playEffect?: (
      type: string,
      params: {
        startDelay?: number;
        duration?: number;
        weakMagnitude?: number;
        strongMagnitude?: number;
      },
    ) => Promise<unknown>;
  };
  hapticActuators?: Array<{
    pulse?: (value: number, duration: number) => Promise<boolean>;
  }>;
};
