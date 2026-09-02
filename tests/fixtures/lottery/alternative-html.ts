/**
 * Fixtures de las fuentes alternativas (D-162, BR-L26).
 *
 * A diferencia de `build-xlsx.ts` y `build-pdf.ts`, que **fabrican** una
 * estructura representativa, aquí el marcado es **real y sanitizado**: se
 * conserva solo el bloque mínimo de cada resultado, con sus nombres de clase
 * exactos, y se tira todo lo demás —publicidad, menús, scripts—.
 *
 * Es deliberado, y la razón es I-088: los defectos de esta familia no vienen
 * de estructuras imaginadas, vienen de la estructura real. Un fixture escrito
 * a mano no habría reproducido nunca la tabla «DEMORADOS - PEPAS» de
 * Perlatodo, que es exactamente la trampa que estos lectores tienen que
 * esquivar.
 *
 * Capturado el 2026-09-02. Ningún dato personal: son números públicos.
 */

/** Fila de resultado real: los cuatro dígitos van en `balotera-home`. */
export const PERLATODO_FILA_RESULTADO = `<tr>
  <td>CRUZ ROJA</td>
  <td>
    <div class="cajon-baloteras">
              <div class="balotera-home">7</div>
                  <div class="balotera-home">1</div>
                  <div class="balotera-home">3</div>
                  <div class="balotera-home">2</div>
                  <div class="balotera-home-dem">0</div>
<div>   </div>
<div></div>
    </div>
  </td>
  <td>2026-09-01</td>
  <td>
    <a href="https://perlatodo.com/perla/resultados-loteria-resultados-cruz-roja/" class="botonres_vmas"><span class="nomovil">VER MÁS </span>+</a>  </td>
</tr>`

/**
 * Fila de la tabla «DEMORADOS - PEPAS», cuyas columnas son
 * `Lotería/Sorteo | Demorados | Fecha Último Resultado`.
 *
 * **`7130` NO es el premio mayor de Medellín del 28 de agosto: es `2608`.**
 * Si un lector devuelve algo para esta fila, está inventando un número con la
 * fecha correcta, que es la forma exacta en que I-088 llegó a producción.
 */
export const PERLATODO_FILA_DEMORADOS = `<tr><td> MEDELLIN</td><td><div class="cajon-baloteras"><div class="balotera-home-dem">7</div><div class="balotera-home-dem">1</div><div class="balotera-home-dem">3</div><div class="balotera-home-dem">0</div></div></td><td>2026-08-28</td></tr>`

export const PERLATODO_INDICE = `<table class="tablaresultados">${PERLATODO_FILA_RESULTADO}</table>
<a class="elementor-accordion-title">DEMORADOS - PEPAS</a>
<table class="tablaresultados"><tr><td>Lotería/Sorteo</td><td>Demorados</td><td>Fecha Último Resultado</td></tr>${PERLATODO_FILA_DEMORADOS}</table>`

/** Portada de Ganar Chance: la fecha vive en el `<h2>` de la sección. */
export const GANARCHANCE_PORTADA = `<h2 class="text-uppercase">Resultados de hoy miércoles 2 de septiembre de 2026</h2>
<div class="flex-container"></div>
<h2 class="text-uppercase">Resultados de ayer martes 1 de septiembre de 2026:</h2>
<div class="flex-container">
    <div class="flex-item">
        <div class="nombre">
            Cruz Roja                            </div>
        <div class="numero">
            7132                                <span class="serie">250</span>
        </div>
    </div>
    <div class="flex-item">
        <div class="nombre">
            Huila                            </div>
        <div class="numero">
            2876                                <span class="serie">129</span>
        </div>
    </div>
</div>`

/** Página por lotería de Ganar Chance: tabla con las últimas cinco fechas. */
export const GANARCHANCE_META = `<h2 class="text-uppercase">Tabla con los resultados de Lotería de Meta:</h2>
<table class="table table-striped table-bordered caption-top">
  <caption>Los últimos cinco:</caption>
  <thead class="bg-gold"><tr><th>Fecha</th><th>Número</th><th>Serie</th></tr></thead>
  <tbody>
    <tr class="none"><td>Miércoles 26 de agosto de 2026</td><td>8134</td><td>096</td></tr>
    <tr class="alt"><td>Miércoles 19 de agosto de 2026</td><td>6086</td><td>048</td></tr>
    <tr class="none"><td>Viernes 14 de agosto de 2026</td><td>5370</td><td>016</td></tr>
  </tbody>
</table>`

/**
 * Loterías de Hoy. La fuente más rica: además del número y la serie publica el
 * NÚMERO DE SORTEO, así que la observación se puede contrastar contra CNJSA.
 * La fecha va sin preposiciones: «01 septiembre 2026».
 */
function bloqueLoteriasDeHoy(
  nombre: string,
  fecha: string,
  numero: string,
  serie: string,
  sorteo: string,
): string {
  const cifras = [...numero]
    .map((d) => `<span class="icon-circle--results"><i class="num">${d}</i></span>`)
    .join('')
  const serieCifras = [...serie]
    .map((d) => `<span class="icon-circle--results num-serie"><i class="num">${d}</i></span>`)
    .join('')
  return `<div class="juego"><h3>${nombre}</h3><div class="mayor-loteria-home"><span class="fecha-resultado">${fecha}</span><div class="resultado-resaltado"><div class="logo-loteria"></div><div class="cuatro-cifras">${cifras}</div><div class="serie">${serieCifras}</div></div><span class="sorteo">Sorteo ${sorteo}</span></div></div>`
}

export const LOTERIASDEHOY_CRUZ_ROJA = bloqueLoteriasDeHoy(
  'Lotería de la Cruz Roja',
  '01 septiembre 2026',
  '7132',
  '250',
  '3169',
)

export const LOTERIASDEHOY_META = bloqueLoteriasDeHoy(
  'Lotería del Meta',
  '26 agosto 2026',
  '8134',
  '096',
  '3313',
)

/** Un número con cero inicial: `0046` nunca puede leerse como `46` (BR-L06). */
export const LOTERIASDEHOY_CEROS = bloqueLoteriasDeHoy(
  'Lotería de Boyacá',
  '29 agosto 2026',
  '0046',
  '393',
  '4639',
)

/**
 * La misma portada, pero con la fecha de AYER y el resultado de ayer: es lo
 * que devolvería una respuesta cacheada. El lector la extrae con su fecha
 * real, y es el consenso quien la descarta por no ser la del sorteo.
 */
export const LOTERIASDEHOY_DIA_ANTERIOR = bloqueLoteriasDeHoy(
  'Lotería de la Cruz Roja',
  '25 agosto 2026',
  '4939',
  '112',
  '3168',
)

/**
 * Ruido que ha producido números inventados en el pasado: una hoja de estilos
 * con dígitos en los nombres de clase, un script y un banner de premios. Un
 * lector que mire la página entera saca `6262` de aquí (I-088).
 */
export const RUIDO_QUE_NO_ES_RESULTADO = `<style>.tdi_62,.tdi_62{color:#000}body.page-id-391{margin:0}</style>
<script>var premio = 9999; var sorteo = 1234;</script>
<div class="banner">GANADOR SECO 200 MILLONES</div>`
