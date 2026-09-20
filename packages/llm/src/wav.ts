export class Wav {
  private static readonly HEADER_BYTES = 44
  private static readonly AUDIO_FORMAT_PCM = 1
  private static readonly CHANNELS = 1
  private static readonly BITS_PER_SAMPLE = 16
  private static readonly BYTES_PER_SAMPLE = Wav.BITS_PER_SAMPLE / 8

  static encodePcm16(samples: Float32Array, sampleRate: number): Uint8Array {
    const bytesPerSample = Wav.BYTES_PER_SAMPLE
    const dataSize = samples.length * bytesPerSample
    const buffer = new ArrayBuffer(Wav.HEADER_BYTES + dataSize)
    const view = new DataView(buffer)

    Wav.writeAscii(view, 0, "RIFF")
    view.setUint32(4, Wav.HEADER_BYTES + dataSize - 8, true)
    Wav.writeAscii(view, 8, "WAVE")
    Wav.writeAscii(view, 12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, Wav.AUDIO_FORMAT_PCM, true)
    view.setUint16(22, Wav.CHANNELS, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * bytesPerSample, true)
    view.setUint16(32, bytesPerSample, true)
    view.setUint16(34, Wav.BITS_PER_SAMPLE, true)
    Wav.writeAscii(view, 36, "data")
    view.setUint32(40, dataSize, true)

    let offset = Wav.HEADER_BYTES
    for (let i = 0; i < samples.length; i++, offset += bytesPerSample) {
      const sample = samples[i] ?? 0
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }

    return new Uint8Array(buffer)
  }

  private static writeAscii(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
}
