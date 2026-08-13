# omni-pdms-v2

Sistema hospitalario de monitoreo de pacientes en diálisis (PDMS) con supervisión SCADA en tiempo real, gestión de terapias y panel de administración. La arquitectura se compone de un **backend en Rust**, un **frontend en React** y un **gateway "bridge"** sobre Raspberry Pi que alimenta los datos seriales de las máquinas. La documentación de despliegue completa está en [DEPLOY.md](./DEPLOY.md).

## Inicio rápido (camino feliz)

> Despliegue de producción e instalación en el hospital: ver [DEPLOY.md](./DEPLOY.md).

1. Clonar el repositorio y preparar variables de entorno:
   ```bash
   git clone <url-del-repositorio> omni-pdms-v2
   cd omni-pdms-v2
   cp .env.example .env   # editar secretos: JWT_SECRET, ADMIN_PASSWORD, DB_PASSWORD
   ```
2. Levantar base de datos y backend (el frontend se compila dentro de la imagen):
   ```bash
   docker compose up -d
   ```
3. Verificar que el servicio responde:
   ```bash
   curl http://localhost:9001/health
   ```
   > El mismo compose funciona con Podman: `podman compose up -d`.

## Arquitectura

| Componente | Tecnología | Rol |
|------------|-----------|-----|
| `server/` | Rust (axum 0.7, sqlx 0.8, PostgreSQL) | API REST + WebSocket; sirve el frontend compilado |
| `frontend/` | React 19, Vite 6, TypeScript, Tailwind 4, TanStack Query 5, Zustand, i18next | Aplicación de una sola página (SCADA, dashboard, administración) |
| `bridge/` | Rust (binario nativo) | Gateway en Raspberry Pi; cliente WebSocket que envía datos seriales de las máquinas |

### server/

- `src/api/` — módulos de rutas: `admin`, `auth`, `profile`, `patients`, `therapies`, `export`, `machines`, `signals`, `equivalences`, `cylinder_configs`, `dashboards` (con sub-módulos `therapies/history.rs` y `therapies/detail.rs`).
- `src/domain/entities.rs` — entidades SQL (trait `FromRow` de sqlx).
- `src/infrastructure/postgres/` — repositorios de acceso a datos.
- `src/schema/` — definiciones SQL de esquema.
- `server/migrations/*.sql` — migraciones numeradas `202501010000NN_*.sql`; **acumulativas e idempotentes** (`IF NOT EXISTS`).

### frontend/

Arquitectura por capas:

- `src/core/` — tipos (`types/`), interfaces de repositorios (`repos/`), utilidades (`utils/`).
- `src/data/` — repositorios HTTP (`repos/`), adaptador WebSocket (`ws-adapter/`), `api-client.ts`, `ws-manager.ts`, `ws-hook.ts`.
- `src/features/` — `scada`, `dashboard`, `history`, `patients`, `profile`, `settings`, `signal-config`, `equivalence-config`, `connections`.
- `src/ui/` — `primitives/` (design system estilo shadcn con variantes `neutral-*` y `dark:`), `components/`, `containers/`, `layouts/`.
- `src/store/` — stores Zustand (auth, theme, live-data, alarm, bridge-status, machine-status).
- `src/i18n/` — catálogos es/en con **paridad estricta** (aplicada por `catalog.test.ts`).

## Decisiones técnicas clave

| Tema | Decisión |
|------|----------|
| Exportación Excel | SheetJS `xlsx` **fijado en 0.20.3** desde el CDN oficial (`cdn.sheetjs.com`), no desde el registro npm (0.18.5 tiene CVE de prototype pollution). |
| Tema visual | El **modo oscuro es la norma**: toda la UI usa `neutral-*` + variantes `dark:`. |
| Modales de administración | Los formularios CRUD de admin abren en `Modal` accesible; se cierra solo con Cancelar / X / Escape — el fondo es inerte. `ConfirmDialog` (borrado) sí se cierra al hacer clic en el fondo. |
| Perfil de usuario | Endpoints en `/users/me` usan cuerpos en **snake_case** (`current_password`, `new_password`). |
| Tabla `users` | Columna `email` **opcional y única** (permite múltiples NULL). |
| Migraciones | Acumulativas e idempotentes; nunca editar una migración ya aplicada. |

## Flujo de desarrollo

### Backend (`server/`)

Con PostgreSQL local:

```bash
cargo run -p server
```

Alternativa integrada (compila el frontend y arranca el servidor): `run.ps1` (Windows) o `run.sh` (Linux/macOS).

### Frontend (`frontend/`)

```bash
npm run dev          # servidor de desarrollo Vite
```

### Pruebas

```bash
# Backend
cd server && cargo test && cargo clippy

# Frontend
cd frontend && npx vitest run && npm run typecheck && npm run build
```

## Autor

Desarrollado por **Santos Rojas**, desarrollador original del sistema. Ver [AUTHORS](./AUTHORS).
