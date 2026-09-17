/**
 * Detects provider errors that mean "the request exceeded the context window".
 *
 * Providers report this inconsistently (and the AI SDK surfaces the raw
 * message), so matching is pattern-based, mirroring opencode's
 * `provider-error.ts`. Rate-limit / capacity errors are excluded because their
 * phrasing overlaps ("too many tokens", "request entity too large").
 */

const PATTERNS = [
  /prompt is too long/i,
  /request_too_large/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i,
  /input token count.*exceeds the maximum/i,
  /tokens in request more than max tokens allowed/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds (?:the )?maximum allowed input length of [\d,]+ tokens?/i,
  /input \(\d+ tokens\) is longer than the model'?s context length \(\d+ tokens\)/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_ ]length[_ ]exceeded/i,
  /context length is only \d+ tokens/i,
  /input length.*exceeds.*context length/i,
  /prompt too long; exceeded (?:max )?context length/i,
  /too large for model with \d+ maximum context length/i,
  /prompt has [\d,]+ tokens?, but the configured context size is [\d,]+ tokens?/i,
  /model_context_window_exceeded/i,
  /token limit exceeded/i,
];

const EXCLUSIONS = [/rate limit/i, /too many requests/i, /throttling error/i, /service unavailable/i];

/** True when a provider error message indicates context-window overflow. */
export function isContextOverflow(message: string): boolean {
  if (EXCLUSIONS.some((pattern) => pattern.test(message))) return false;
  return PATTERNS.some((pattern) => pattern.test(message));
}
