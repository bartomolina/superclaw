Aquí lo tienes traducido, manteniendo rutas, enlaces, HTML y bloques técnicos intactos:

````markdown
# 🦞 SuperClaw — Suite complementaria para OpenClaw

<p align="center">
  <img src="./assets/superclaw-logo.png" alt="SuperClaw" width="500">
</p>

<p align="center">
  <strong>Dashboard, Kanban y extensión de navegador para usar OpenClaw en el día a día.</strong>
</p>

**SuperClaw** es la suite complementaria local para [OpenClaw](https://github.com/openclaw/openclaw).
Te proporciona un dashboard para gestionar agentes y ver información útil de tu VPS, además de una aplicación Kanban para coordinar trabajo entre agentes y humanos.

Por defecto, las aplicaciones están pensadas para ejecutarse junto a OpenClaw en **modo desarrollo**. La idea es darte un punto de partida sólido que puedas instalar, ejecutar localmente y luego adaptar a tu propia configuración y flujo de trabajo.

<p align="center">
  <a href="./INSTALL.md">Instalación y uso</a> · <a href="./OPENCLAW_SETUP.md">Configuración recomendada</a> · <a href="./dashboard/README.md">Documentación del Dashboard</a> · <a href="./kanban/README.md">Documentación de Kanban</a> · <a href="./extension/README.md">Documentación de la extensión</a> · <a href="./LICENSE">Licencia</a>
</p>

<table>
  <tr>
    <td align="center" width="33.33%">
      <img src="./assets/dashboard-agents.png" alt="Vista de agentes del dashboard de SuperClaw" width="100%"><br>
      <sub><strong>Dashboard · Agentes</strong></sub>
    </td>
    <td align="center" width="33.33%">
      <img src="./assets/dashboard-ops.png" alt="Vista de operaciones del dashboard de SuperClaw" width="100%"><br>
      <sub><strong>Dashboard · Operaciones</strong></sub>
    </td>
    <td align="center" width="33.33%">
      <img src="./assets/kanban.png" alt="Tablero Kanban de SuperClaw" width="100%"><br>
      <sub><strong>Kanban</strong></sub>
    </td>
  </tr>
</table>

## Requisitos

- **[Convex](https://www.convex.dev/)** — backend/base de datos remoto para tareas, tableros y estado del flujo de trabajo de Kanban
- **[Resend](https://resend.com/)** — para los emails de autenticación de Kanban

### Opcional

- **[Clave API de Gemini](https://aistudio.google.com/)** — opcional para la generación de avatares del dashboard durante el flujo de creación de agentes
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — recomendado para exponer/gestionar las aplicaciones de forma limpia. Para nuevos registros DNS, prefiere la API/panel directamente o un certificado de `cloudflared` correcto para la zona; `cloudflared tunnel route dns` puede apuntar a la zona equivocada si el certificado local está obsoleto o limitado a otra zona.

## Instalación y uso

Si necesitas orientación sobre cómo configurar OpenClaw antes de instalar SuperClaw, revisa [`OPENCLAW_SETUP.md`](./OPENCLAW_SETUP.md).

Luego sigue [`INSTALL.md`](./INSTALL.md), o apunta tu agente de OpenClaw a ese archivo y haz que ejecute la configuración por ti.

SuperClaw se instala dentro de tu workspace principal de OpenClaw:

```text
~/.openclaw/workspace/
├── apps/
│   └── superclaw/
│       ├── dashboard/
│       ├── kanban/
│       └── extension/
└── skills/
    ├── superclaw/
    └── kanban/
````

El flujo por defecto ejecuta las aplicaciones en modo desarrollo. Lo ideal es usar este repositorio como punto de partida y adaptarlo a tu propia configuración según tus necesidades.

Puertos preferidos por defecto si están libres:

* Dashboard: `19830`
* Kanban: `19831`

Si esos puertos ya están en uso en el host, elige puertos cercanos libres y mantén alineada la configuración del servicio, las variables de entorno y el túnel.

```
```
