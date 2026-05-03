Claro. He mantenido **comandos, rutas, variables de entorno, nombres de servicios y bloques de código sin traducir** para que el runbook siga siendo ejecutable.

````markdown
# Runbook de instalación de SuperClaw

Usa esto cuando se le pida a un agente de OpenClaw instalar SuperClaw.

## Alcance

- instalación limpia únicamente
- el usuario ya tiene OpenClaw funcionando
- instalar dentro de `~/.openclaw/workspace/apps/superclaw/`
- ejecutar localmente
- ejecutar en modo desarrollo
- gestionar servicios de larga duración con systemd

Nombres recomendados para las unidades systemd:
- `superclaw-dashboard.service`
- `superclaw-convex.service`
- `superclaw-kanban.service`

## Valores fijos por defecto

Rutas:
- `~/.openclaw/workspace/apps/superclaw/dashboard`
- `~/.openclaw/workspace/apps/superclaw/kanban`
- `~/.openclaw/workspace/apps/superclaw/extension`

Puertos preferidos por defecto si están libres:
- Dashboard: `19830`
- Kanban: `19831`

Host:
- `127.0.0.1`

## Qué debe hacer el agente de instalación

1. comprobar los prerrequisitos
2. detectar la configuración existente cuando sea posible
3. preguntar al usuario solo por los valores obligatorios que falten
4. instalar el dashboard
5. instalar kanban
6. conectar/inicializar Convex
7. configurar las variables de entorno de Convex
8. crear e iniciar los servicios systemd
9. sincronizar las skills incluidas de SuperClaw en `~/.openclaw/skills/`
10. compilar la extensión
11. reportar las URLs finales y cualquier seguimiento manual necesario

## Reglas

### Preguntar solo cuando sea necesario

Reutiliza los valores existentes si ya están disponibles.

Valores típicos que se deben pedir:
- `SUPERUSER_EMAIL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL` requerido para envío real/compartido de emails; opcional para fallback de pruebas de autoenvío
- `GEMINI_API_KEY` opcional, para generación de avatar del dashboard durante la creación de agentes
- Login/selección de proyecto en Convex si la CLI necesita interacción del usuario

### No improvisar

No cambiar:
- ruta de instalación
- nombres de las unidades systemd
- runtime en modo desarrollo

Regla de puertos:
- preferir Dashboard `19830` y Kanban `19831` cuando estén libres
- si esos puertos ya están en uso, elegir puertos cercanos libres y sustituirlos de forma consistente en las unidades systemd, variables de entorno, configuración del túnel, configuración de la extensión y reporte final

Si más adelante se necesita exposición pública, preferir **Cloudflare Tunnel** mediante `cloudflared.service`.

Para nuevos registros DNS públicos, no confiar ciegamente en `cloudflared tunnel route dns <tunnel> <hostname>`. Si el certificado local de login de `cloudflared` está asociado a la zona incorrecta, puede crear el registro bajo esa zona equivocada. Opciones más seguras:
- volver a ejecutar `cloudflared tunnel login` primero para la zona prevista,
- mantener certificados por zona y ejecutar `cloudflared tunnel --origincert /path/to/<zone>-cert.pem route dns ...`, o
- crear el registro DNS directamente mediante la API/panel de Cloudflare como un `CNAME` proxied hacia `<tunnel-id>.cfargotunnel.com`.

No cambiar a Docker ni a modo producción salvo que el usuario lo pida explícitamente.

## Comprobaciones de prerrequisitos

Verificar:
- OpenClaw está instalado y funcionando
- `pnpm` existe
- `systemctl` existe
- el código existe bajo `~/.openclaw/workspace/apps/superclaw/`

Si OpenClaw no está funcionando, detenerse e indicar al usuario que SuperClaw depende de OpenClaw.

## Instalación del Dashboard

```bash
cd ~/.openclaw/workspace/apps/superclaw/dashboard
pnpm install
cp .env.example .env
````

Variable de entorno obligatoria:

* `GATEWAY_TOKEN`

Variables de entorno opcionales:

* `OPENCLAW_HOME`
* `GEMINI_API_KEY` o `GOOGLE_API_KEY` para generación de avatar del dashboard durante la creación de agentes
* `DEBUG_RPC_ENABLED`

Si el usuario quiere generación de avatar en el dashboard, configurar la clave API de Gemini/Google en `dashboard/.env` antes de iniciar `superclaw-dashboard.service`.

Crear el servicio con:

```bash
sudo tee /etc/systemd/system/superclaw-dashboard.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/dashboard
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec next dev --hostname 127.0.0.1 --port 19830
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
```

## Instalación de Kanban

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
pnpm install
cp .env.local.example .env.local
```

Variables locales obligatorias en `.env.local`:

* `CONVEX_DEPLOYMENT`
* `NEXT_PUBLIC_CONVEX_URL`
* `NEXT_PUBLIC_CONVEX_SITE_URL`
* `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:19831` para una configuración local de una sola máquina, o tu host/IP privado/interno para acceso no público desde otros dispositivos
* `GATEWAY_TOKEN`

### Notas sobre Convex

* un despliegue nuevo de Convex está bien
* el esquema y las funciones se crean desde el código del repositorio cuando se ejecuta la sincronización
* no se necesita configuración manual de SQL
* el usuario aún necesita un despliegue válido de Convex y las variables de entorno requeridas

Variables de entorno obligatorias de Convex:

* `BETTER_AUTH_SECRET`
* `SITE_URL=http://127.0.0.1:19831` para una configuración local de una sola máquina, o tu origen canónico privado/interno/público en otros modos
* `SUPERUSER_EMAIL`
* `RESEND_API_KEY`
* `KANBAN_AGENT_SHARED_TOKEN`

Muy recomendado para envío real/compartido de emails:

* `AUTH_FROM_EMAIL`

Si se omite `AUTH_FROM_EMAIL`, Kanban usará como fallback `SuperClaw <onboarding@resend.dev>`, que Resend solo permite para pruebas limitadas de autoenvío.

`SITE_URL` es el origen canónico de autenticación usado en los emails con magic link.

Dejar `TRUSTED_ORIGINS` sin configurar por defecto.

Si intencionalmente quieres que también funcionen orígenes privados/internos alternativos, por ejemplo `http://my-host:19831` o `http://100.x.y.z:19831`, añade solo esos extras a `TRUSTED_ORIGINS`.

Crear el servicio de sincronización de Convex:

```bash
sudo tee /etc/systemd/system/superclaw-convex.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Convex Sync
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/kanban
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec convex dev
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
```

Crear el servicio de Kanban:

```bash
sudo tee /etc/systemd/system/superclaw-kanban.service >/dev/null <<'EOF'
[Unit]
Description=SuperClaw Kanban
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.openclaw/workspace/apps/superclaw/kanban
Environment=HOME=%h
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:%h/.local/bin:%h/.local/share/pnpm
ExecStart=/usr/bin/pnpm exec next dev --hostname 127.0.0.1 --port 19831
Restart=always
RestartSec=5
User=%u

[Install]
WantedBy=multi-user.target
EOF
```

Modos de exposición de Kanban:

* **desarrollo local en una sola máquina:** mantener `ExecStart ... --hostname 127.0.0.1 --port 19831`, mantener el ingress del túnel desactivado y mantener `NEXT_PUBLIC_SITE_URL` / `SITE_URL` en el mismo origen local
* **acceso privado interno/Tailscale:** vincular Kanban a tu IP interna en lugar de `127.0.0.1`, mantener el ingress del túnel desactivado y configurar tanto `NEXT_PUBLIC_SITE_URL` como `SITE_URL` con ese origen interno
* **modo compartido/público:** añadir ingress de Cloudflare Tunnel para el hostname público y configurar tanto `NEXT_PUBLIC_SITE_URL` como `SITE_URL` con esa URL pública para que los emails con magic link apunten al lugar correcto

Cambiar solo el host de bind del servicio o solo el túnel no es suficiente cuando la autenticación con magic link está habilitada; las variables de entorno de URL canónica también deben coincidir con el modo de acceso previsto.

Si quieres múltiples formas privadas/internas de acceder al mismo Kanban privado, mantén un único `SITE_URL` canónico y coloca solo los orígenes internos adicionales permitidos en `TRUSTED_ORIGINS`. De lo contrario, déjalo sin configurar.

Habilitar e iniciar los servicios:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
sudo systemctl status superclaw-dashboard.service superclaw-convex.service superclaw-kanban.service
```

## Sincronización de skills

Sincronizar las copias del repositorio de las skills de SuperClaw en el directorio activo de skills de OpenClaw:

```bash
mkdir -p ~/.openclaw/skills
rsync -a ~/.openclaw/workspace/apps/superclaw/skills/ ~/.openclaw/skills/
```

Copias activas esperadas de las skills:

* `~/.openclaw/skills/superclaw/`
* `~/.openclaw/skills/kanban/`

### Variables de entorno del runtime del worker de Kanban

Derivar el entorno canónico del worker de Kanban desde la configuración local de Kanban + Convex:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/resolve-worker-env.sh
# o emitir exports de shell:
./scripts/resolve-worker-env.sh --exports
```

Persistir estos dos valores para el runtime de OpenClaw:

* `KANBAN_BASE_URL`
* `KANBAN_AGENT_TOKEN`

Reglas:

* los agentes locales/sin sandbox deben leerlos desde el entorno del servicio gateway de OpenClaw
* no copiarlos automáticamente en `agents.defaults.sandbox.docker.env`
* el acceso de Kanban desde sandbox debe configurarse manualmente por agente cuando sea necesario bajo `agents.list[].sandbox.docker.env`
* `KANBAN_AGENT_SHARED_TOKEN` sigue siendo la credencial compartida por defecto para agentes confiables/locales
* se soportan credenciales Kanban dedicadas por agente para aislamiento; cuando exista una para un id de agente, ese agente debe usar su token dedicado en lugar del compartido

Si un agente va a ejecutar pasadas del worker de Kanban dentro de un workspace de agente con sandbox, copiar también las skills requeridas de SuperClaw dentro de ese workspace de agente para que el sandbox pueda leerlas localmente:

```bash
mkdir -p ~/.openclaw/workspace-<agent>/skills
rsync -a ~/.openclaw/skills/kanban/ ~/.openclaw/workspace-<agent>/skills/kanban/
rsync -a ~/.openclaw/skills/superclaw/ ~/.openclaw/workspace-<agent>/skills/superclaw/
```

Para provisionar una credencial Kanban dedicada para un agente con sandbox y obtener el payload exacto de variables de entorno que se debe inyectar en `agents.list[].sandbox.docker.env`:

```bash
cd ~/.openclaw/workspace/apps/superclaw/kanban
./scripts/provision-agent-credential.mjs <agent-id> --json
```

## Compilación de la extensión

```bash
cd ~/.openclaw/workspace/apps/superclaw/extension
pnpm install
pnpm build
```

Opcional:

```bash
pnpm zip
```

Salida esperada:

* `.output/chrome-mv3/`

No intentar instalar la extensión en el navegador salvo que el usuario lo pida explícitamente.

## Finalización

Reportar:

* qué se instaló
* nombres de las unidades systemd
* URLs locales
* si la configuración de Convex funcionó
* dónde está la build de la extensión
* cualquier siguiente paso manual que aún sea necesario

```
```
