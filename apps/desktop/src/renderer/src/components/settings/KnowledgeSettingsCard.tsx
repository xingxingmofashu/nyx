import type { KnowledgeSettings } from "../../types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Field, FieldDescription, FieldLabel } from "../ui/field"
import { Input } from "../ui/input"

export interface KnowledgeSettingsCardProps {
  knowledge: KnowledgeSettings
  onChange: (next: KnowledgeSettings) => void
}

/** Knowledge base settings: how documents are chunked before embedding. */
export function KnowledgeSettingsCard({ knowledge, onChange }: KnowledgeSettingsCardProps) {
  const parse = (value: string): number | undefined => {
    const parsed = Number(value)
    return value.trim() === "" || !Number.isFinite(parsed) ? undefined : parsed
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge</CardTitle>
        <CardDescription>
          How imported Markdown is split before embedding. Applies on the next index rebuild.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="knowledge-chunk-size">Chunk size</FieldLabel>
          <Input
            id="knowledge-chunk-size"
            type="number"
            min={1}
            value={knowledge.chunkSize ?? ""}
            onChange={(e) => onChange({ ...knowledge, chunkSize: parse(e.target.value) })}
            placeholder="480"
            className="max-w-40"
          />
          <FieldDescription>
            Target tokens per passage (~1 per CJK character, 0.25 per other character).
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="knowledge-chunk-overlap">Chunk overlap</FieldLabel>
          <Input
            id="knowledge-chunk-overlap"
            type="number"
            min={0}
            value={knowledge.chunkOverlap ?? ""}
            onChange={(e) => onChange({ ...knowledge, chunkOverlap: parse(e.target.value) })}
            placeholder="100"
            className="max-w-40"
          />
          <FieldDescription>
            Tokens carried over from the previous passage; clamped below the chunk size.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}
