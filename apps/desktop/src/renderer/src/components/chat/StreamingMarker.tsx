import { Spinner } from "../ui/spinner"
import { Marker, MarkerContent, MarkerIcon } from "../ui/marker"

/** Inline "working" indicator shown while a reply is pending. */
export function StreamingMarker({ label = "Thinking…" }: { label?: string }) {
  return (
    <Marker role="status">
      <MarkerIcon>
        <Spinner className="text-muted-foreground" />
      </MarkerIcon>
      <MarkerContent className="text-muted-foreground">{label}</MarkerContent>
    </Marker>
  )
}
