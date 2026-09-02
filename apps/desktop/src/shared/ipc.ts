/** IPC channel names shared between main, preload, and renderer. */
export const IPC = {
  chat: {
    send: "chat:send",
    abort: "chat:abort",
    setModel: "chat:setModel",
    /** main → renderer: streaming agent events. */
    event: "chat:event",
  },
  image: {
    run: "image:run",
    setModel: "image:setModel",
  },
  models: {
    list: "models:list",
    pull: "models:pull",
    /** main → renderer: download progress. */
    progress: "models:progress",
  },
  config: {
    getModelsDir: "config:getModelsDir",
  },
  window: {
    minimize: "window:minimize",
    toggleMaximize: "window:toggleMaximize",
    close: "window:close",
    /** main → renderer: the window's maximized state changed. */
    maximized: "window:maximized",
  },
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC][keyof (typeof IPC)[keyof typeof IPC]]
