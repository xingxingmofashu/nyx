/** IPC channel names shared between main, preload, and renderer. */
export const IPC = {
  tasks: {
    imageToImage: {
      run: "image-to-image:run",
    },
    textToSpeech: {
      run: "text-to-speech:run",
    },
    automaticSpeechRecognition: {
      run: "automatic-speech-recognition:run",
    },
  },
  /** Agent chat streaming (AI SDK UI message stream). */
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
  /** Persisted agent chat sessions (transcripts live in ~/.nyx/sessions). */
  sessions: {
    list: "sessions:list",
    get: "sessions:get",
    save: "sessions:save",
    rename: "sessions:rename",
    setPinned: "sessions:setPinned",
    remove: "sessions:remove",
    getActive: "sessions:getActive",
    setActive: "sessions:setActive",
  },
  dialog: {
    selectDirectory: "dialog:selectDirectory",
    saveFile: "dialog:saveFile",
  },
  /** Read a generated workspace file (e.g. a spoken reply) back for playback. */
  files: {
    readDataUrl: "files:readDataUrl",
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
