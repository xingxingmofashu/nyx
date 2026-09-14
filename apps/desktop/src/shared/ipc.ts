/** IPC channel names shared between main, preload, and renderer. */
export const IPC = {
  tasks: {
    imageToImage: {
      run: "image-to-image:run",
    },
  },
  /** Generic chat streaming (AI SDK UI message stream) for the agent + local text generation. */
  chat: {
    send: "chat:send",
    abort: "chat:abort",
    /** main → renderer: streamed chunks / completion / error, tagged with a stream id. */
    event: "chat:event",
  },
  models: {
    list: "models:list",
    pull: "models:pull",
    cancelPull: "models:cancelPull",
    remove: "models:remove",
    /** main → renderer: download progress. */
    progress: "models:progress",
  },
  config: {
    getModelsDir: "config:getModelsDir",
    getSettings: "config:getSettings",
    setSettings: "config:setSettings",
  },
  dialog: {
    selectDirectory: "dialog:selectDirectory",
  },
  window: {
    minimize: "window:minimize",
    toggleMaximize: "window:toggleMaximize",
    close: "window:close",
    /** main → renderer: the window's maximized state changed. */
    maximized: "window:maximized",
  },
} as const

export type IpcChannel =
  (typeof IPC)[keyof typeof IPC][keyof (typeof IPC)[keyof typeof IPC]]
