export type PlatformLoginRequest = {
  platform: "telegram" | "max" | "vk" | "web";
  launchData: {
    raw: string;
  };
};
