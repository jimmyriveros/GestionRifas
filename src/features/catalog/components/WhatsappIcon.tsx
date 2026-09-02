/**
 * El simbolo de WhatsApp (D-163).
 *
 * POR QUE UN SVG PROPIO Y NO UN ICONO DE `lucide-react`. Lucide retiro los
 * logotipos de marca, y el sustituto natural —un bocadillo generico— no dice a
 * donde lleva el boton: en esta pagina TODAS las acciones salen a WhatsApp, y
 * quien la abre reconoce el simbolo antes que la palabra. Es un trazo, no una
 * dependencia: no se instala nada.
 *
 * `aria-hidden` SIEMPRE. El icono no es el nombre del boton; ese lo pone el
 * texto que lo acompaña («Solicitar», «Escríbenos por WhatsApp»). Un icono que
 * ademas se anunciara dejaria botones que se leen dos veces.
 *
 * `currentColor` para que herede el color del boton que lo contiene, igual que
 * hacen los iconos de lucide en el resto del proyecto.
 */
export function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.57-.48-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.46s1.06 2.86 1.21 3.06c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23a8.18 8.18 0 0 1 5.82 2.42 8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Z" />
    </svg>
  )
}
