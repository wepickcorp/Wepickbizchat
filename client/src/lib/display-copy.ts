export function getUserFacingMessageName(name?: string | null) {
  return (name || "").replace(/템플릿/g, "메시지");
}
