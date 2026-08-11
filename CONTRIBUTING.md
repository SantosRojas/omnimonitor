# Contribuir a omni-pdms-v2

Guía de convenciones para mantener la base de código consistente. Documentación completa de despliegue en [DEPLOY.md](./DEPLOY.md).

## Commits

El repositorio usa **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Requisitos:

- **Nunca** agregar líneas de atribución de IA (ej. `Co-Authored-By`).
- Mantener commits pequeños y revisables; los tests y la documentación viajan junto al código.
- Referencia útil: skill `work-unit-commits`.

## Reglas de testing

Antes de proponer un cambio, debe pasar lo siguiente:

- [ ] Backend: `cargo test` y `cargo clippy` en `server/`.
- [ ] Frontend: `npx vitest run`, `npm run typecheck` y `npm run build` en `frontend/`.
- [ ] Paridad i18n: **toda clave agregada a `es` debe agregarse a `en` y viceversa** (aplicado por `catalog.test.ts`).

## Migraciones

- Nueva migración = siguiente número consecutivo: `202501010000NN_nombre.sql`.
- Debe ser **acumulativa e idempotente** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.).
- **No editar** migraciones ya aplicadas: agregar una nueva en su lugar.

## Estilo frontend

- Usar componentes de `frontend/src/ui/primitives` (Button, Input, Card, Modal, Select, Badge, etc.) y la utilidad `cn()`.
- **Modo oscuro obligatorio**: toda UI requiere variantes `dark:` y colores `neutral-*`.
- El texto visible de la UI va por los catálogos i18n (es y en). **No interpolar cadenas en el código**; no dejar copy hardcodeado.

## Flujo de datos

- Componentes de feature → interfaces de repositorio en `src/core/repos` → implementación HTTP en `src/data/repos`.
- Estado del servidor con **TanStack Query**; estado local de sesión/UI con Zustand.

## Estilo backend

- Handlers en módulos de `src/api/`, entidades en `src/domain/entities.rs`.
- Acceso a base de datos **solo** vía repositorios de `src/infrastructure/postgres`.
- Contraseñas con **argon2**; autenticación JWT mediante `Claims`.

## Checklist de PR / revisión

- [ ] `cargo test` + `cargo clippy` en verde.
- [ ] `vitest run` + `typecheck` + `build` en verde.
- [ ] Paridad de catálogos i18n (es/en).
- [ ] Modo oscuro implementado (`dark:`).
- [ ] Sin secretos en el código ni `.env` commiteados.
