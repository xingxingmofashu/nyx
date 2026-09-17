import * as automaticSpeechRecognitionModule from "./tasks/automatic-speech-recognition.ts"
import * as featureExtractionModule from "./tasks/feature-extraction.ts"
import * as imageToImageModule from "./tasks/image-to-image.ts"
import * as modelModule from "./model.ts"
import * as runtimeModule from "./runtime.ts"
import * as textToSpeechModule from "./tasks/text-to-speech.ts"
import * as wavModule from "./wav.ts"

export namespace LLM {
  export import LLM_TASKS = modelModule.LLM_TASKS
  export import Model = modelModule.Model
  export import PullAbortedError = modelModule.PullAbortedError
  export import Runtime = runtimeModule.Runtime
  export import Wav = wavModule.Wav
  export import OnnxImageToImageProvider = imageToImageModule.OnnxImageToImageProvider
  export import OnnxTextToSpeechProvider = textToSpeechModule.OnnxTextToSpeechProvider
  export import OnnxAutomaticSpeechRecognitionProvider =
    automaticSpeechRecognitionModule.OnnxAutomaticSpeechRecognitionProvider
  export import OnnxFeatureExtractionProvider = featureExtractionModule.OnnxFeatureExtractionProvider

  export type LLMTask = modelModule.LLMTask
  export type LLMProvider = modelModule.LLMProvider
  export type CachedModel = modelModule.CachedModel
  export type RuntimeOptions = runtimeModule.RuntimeOptions
  export type ProgressInfo = runtimeModule.ProgressInfo
  export type ImageProvider = imageToImageModule.ImageProvider
  export type ImageSource = imageToImageModule.ImageSource
  export type OnnxImageToImageOptions = imageToImageModule.OnnxImageToImageOptions
  export type SpeechProvider = textToSpeechModule.SpeechProvider
  export type TextToSpeechOptions = textToSpeechModule.TextToSpeechOptions
  export type OnnxTextToSpeechOptions = textToSpeechModule.OnnxTextToSpeechOptions
  export type TranscriptionProvider = automaticSpeechRecognitionModule.TranscriptionProvider
  export type AutomaticSpeechRecognitionOptions = automaticSpeechRecognitionModule.AutomaticSpeechRecognitionOptions
  export type OnnxAutomaticSpeechRecognitionOptions =
    automaticSpeechRecognitionModule.OnnxAutomaticSpeechRecognitionOptions
  export type EmbeddingProvider = featureExtractionModule.EmbeddingProvider
  export type EmbeddingOptions = featureExtractionModule.EmbeddingOptions
  export type OnnxFeatureExtractionOptions = featureExtractionModule.OnnxFeatureExtractionOptions
}
