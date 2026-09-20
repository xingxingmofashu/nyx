
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
  
  chat: {
    send: "chat:send",
    
    compact: "chat:compact",
    abort: "chat:abort",
    
    event: "chat:event",
  },
  models: {
    list: "models:list",
    pull: "models:pull",
    cancelPull: "models:cancelPull",
    remove: "models:remove",
    
    progress: "models:progress",
  },
  
  knowledge: {
    status: "knowledge:status",
    list: "knowledge:list",
    read: "knowledge:read",
    
    importFiles: "knowledge:importFiles",
    importFolder: "knowledge:importFolder",
    
    remove: "knowledge:remove",
    index: "knowledge:index",
    cancelIndex: "knowledge:cancelIndex",
    search: "knowledge:search",
    
    progress: "knowledge:progress",
  },
  config: {
    getSettings: "config:getSettings",
    setSettings: "config:setSettings",
    
    writeSettings: "config:writeSettings",
    
    listModels: "config:listModels",
    
    restartServer: "config:restartServer",
  },
  
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
    
    confirm: "dialog:confirm",
  },
  
  files: {
    readDataUrl: "files:readDataUrl",
    
    saveAttachment: "files:saveAttachment",
  },
  window: {
    minimize: "window:minimize",
    toggleMaximize: "window:toggleMaximize",
    close: "window:close",
    
    maximized: "window:maximized",
  },
} as const

export type IpcChannel =
  (typeof IPC)[keyof typeof IPC][keyof (typeof IPC)[keyof typeof IPC]]
