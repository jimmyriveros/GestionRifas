# Composiciones del hero del catálogo público

Los **PNG maestros** de las dos composiciones que usa `/catalogo/<slug>` (D-163).

| Archivo | Medidas | Para qué |
|---|---|---|
| `catalog-hero-desktop-sportage-hev-2026.png` | 1672 × 941, con transparencia | Maestro de la composición **horizontal** |
| `catalog-hero-mobile-sportage-hev-2026.png` | 1024 × 1536, con transparencia | Maestro de la composición **vertical** |

## Por qué viven aquí y no en `public/`

Todo lo que está en `public/` **se sirve y se despliega**, aunque no lo use nadie: los dos maestros
suman 3,6 MB que ningún visitante llega a pedir. Lo que la aplicación usa son los **WebP**, en
`public/images/catalog/`, y son los únicos que deben estar ahí.

Esta carpeta no la sirve Next: es material de diseño, como el guion de una migración es material de
base de datos. Se versiona para que quien tenga que regenerar un derivado —otro tamaño, otro
formato— parta del original y no de una copia ya comprimida.

## Cómo se regeneran los WebP

```bash
npx sharp-cli --input design/catalog/<maestro>.png --output public/images/catalog/ --format webp
```

Cualquier herramienta vale mientras conserve la **transparencia**: el hero se pinta sobre el fondo
oscuro del catálogo y una composición con fondo opaco dejaría un rectángulo negro sobre los
resplandores. Después hay que comprobar el peso: la página descarga **una** de las dos y el derivado
más grande que sirve hoy pesa 272,9 KB.
