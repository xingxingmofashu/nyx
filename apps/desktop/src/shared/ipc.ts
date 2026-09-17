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
    /** Summarize the transcript now (manual Compact). */
    compact: "chat:compact",
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
  /** The local knowledge base (documents + vector index). */
  knowledge: {
    status: "knowledge:status",
    list: "knowledge:list",
    read: "knowledge:read",
    /** Pick + read + import documents into a target folder ("" = root); asks before overwriting. */
    importFiles: "knowledge:importFiles",
    importFolder: "knowledge:importFolder",
    /** Delete a document after a native confirmation. */
    remove: "knowledge:remove",
    index: "knowledge:index",
    cancelIndex: "knowledge:cancelIndex",
    search: "knowledge:search",
    /** main → renderer: index build progress. */
    progress: "knowledge:progress",
  },
  config: {
    getModelsDir: "config:getModelsDir",
    getSettings: "config:getSettings",
    setSettings: "config:setSettings",
    /** Replace settings.json wholesale (can delete keys; `setSettings` deep-merges). */
    writeSettings: "config:writeSettings",
    /** Paths + which env vars are overriding settings, for the Settings page. */
    getEnvironment: "config:getEnvironment",
    /** List a provider's models from its `/models` endpoint (main-process fetch). */
    listModels: "config:listModels",
    /** Context window for a provider/model, read from the cached models.dev catalog. */
    modelLimits: "config:modelLimits",
    /** Restart the inference-server child (applies a changed HF endpoint). */
    restartServer: "config:restartServer",
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
    /** Native yes/no confirmation; resolves true when confirmed. */
    confirm: "dialog:confirm",
  },
  /** Read an agent-generated file (e.g. a spoken reply) back for playback. */
  files: {
    readDataUrl: "files:readDataUrl",
    /** Copy a user-picked attachment into the workspace so agent tools can read it. */
    saveAttachment: "files:saveAttachment",
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
