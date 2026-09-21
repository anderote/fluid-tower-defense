/** Keep the game surface from exposing browser editing and context-menu actions. */
export function installInteractionGuards(): void {
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('selectstart', event => event.preventDefault());
}
