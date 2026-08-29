export function fireAndForget(thenable) {
  Promise.resolve(thenable).catch(() => {})
}
