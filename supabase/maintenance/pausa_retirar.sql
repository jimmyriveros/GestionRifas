-- =============================================================================
-- PAUSA DE PUBLICACIÓN — retirar el gancho (D-239, RUNBOOK §10)
--
-- Primer paso de los dos de retirar la pausa. Quita `pgrst.db_pre_request` y le
-- pide a PostgREST que recargue su configuración. NO borra el esquema `pausa`:
-- si se borrara aquí y PostgREST aún no hubiera recargado, cada petición fallaría
-- buscando una función que ya no existe.
--
-- El segundo paso, `drop schema pausa cascade;`, va SOLO cuando una petición ya
-- no traiga la cabecera `X-Rifas-Pausa` —la prueba de que PostgREST recargó—.
-- `scripts/maintenance-pause.ts retirar` hace los dos y comprueba entre medias.
--
-- Se niega con la pausa CERRADA: retirarla así la abriría sin que nadie
-- comprobara la combinación de código y base. Primero se abre.
-- =============================================================================

begin;

do $pausa$
begin
  if to_regclass('pausa.estado') is not null
     and exists (select 1 from pausa.estado where id = 1 and cerrada) then
    raise exception 'La pausa está cerrada: ábrela antes de retirarla. No se cambió nada.';
  end if;
end
$pausa$;

alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

commit;
