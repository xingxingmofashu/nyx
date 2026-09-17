export class Wav {
  static encodePcm16(samples: Float32Array, sampleRate: number): Uint8Array {
    const bytesPerSample = 2
    const dataSize = samples.length * bytesPerSample
    const buffer = new ArrayBuffer(44 + dataSize)
    const view = new DataView(buffer)

    Wav.writeAscii(view, 0, "RIFF")
    view.setUint32(4, 36 + dataSize, true)
    Wav.writeAscii(view, 8, "WAVE")
    Wav.writeAscii(view, 12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * bytesPerSample, true)
    view.setUint16(32, bytesPerSample, true)
    view.setUint16(34, 16, true)
    Wav.writeAscii(view, 36, "data")
    view.setUint32(40, dataSize, true)

    let offset = 44
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
