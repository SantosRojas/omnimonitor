# Despliegue en el servidor — omni-pdms-v2

> Guía de pasos para instalar y actualizar omni-pdms-v2 en el servidor del
> hospital. Para contexto completo (rollback, bridge, TLS, despliegue nativo)
> ver [DEPLOY.md](DEPLOY.md).

---

## 1. Requisitos del servidor

- **Docker Engine** ≥ 24 + **Docker Compose** (plugin)
  ```bash
  sudo apt install docker.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```
- **Puertos abiertos**: `9001` (API + WebSocket + frontend). Si hay firewall:
  ```bash
  sudo ufw allow 9001/tcp
  ```

---

## 2. Primera instalación

### 2.0 Generar el paquete (máquina de desarrollo)

> Elegí el script según el sistema operativo de tu **máquina de desarrollo**
> (la que compila), NO según el servidor. El resultado es el mismo:
> `omni-pdms-server.tar` con backend + frontend compilados en la imagen.

**Máquina de desarrollo Windows** (PowerShell):

```powershell
.\deploy.ps1
```

> Requiere Docker Desktop (o Podman) instalado en Windows. La imagen que se
> genera es **Linux** aunque compiles en Windows — las stages del Dockerfile
> usan `node:20-alpine` y `rust:1-slim-bookworm`, y Docker Desktop las ejecuta
> en una VM interna. El `.tar` es 100% compatible con el servidor Linux.

**Máquina de desarrollo Linux / macOS** (terminal):

```bash
chmod +x deploy.sh
./deploy.sh

Esto crea `omni-pdms-server.tar` (backend + frontend compilado en la imagen).

### 2.1 Crear el directorio de la aplicación

```bash
sudo mkdir -p /opt/omni-pdms
cd /opt/omni-pdms
```

### 2.2 Copiar los archivos

Desde la máquina de desarrollo (donde se generó `omni-pdms-server.tar`):

```bash
# Imagen con el backend + frontend ya compilados
scp omni-pdms-server.tar usuario@servidor:/opt/omni-pdms/

# Definición de servicios
scp docker-compose.yml usuario@servidor:/opt/omni-pdms/

# Variables de entorno (¡ajustar antes de arrancar!)
scp .env usuario@servidor:/opt/omni-pdms/
```

### 2.3 Cargar la imagen

```bash
cd /opt/omni-pdms
sudo docker load -i omni-pdms-server.tar
```

### 2.4 Configurar el .env

Editar `/opt/omni-pdms/.env` — **obligatorio**:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | Generar con `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | Contraseña fuerte del admin |
| `DB_PASSWORD` | Contraseña de la base de datos |

> `DB_HOST` debe quedar como `postgres` (nombre del servicio compose).
> NO usar `localhost` con Docker — el contenedor no ve el localhost del host.

### 2.5 Arrancar

```bash
sudo docker compose up -d
```

### 2.6 Verificar

```bash
curl http://localhost:9001/health
# → {"status":"ok"}
```

Abrir en el navegador: `http://<ip-del-servidor>:9001`
(usuario `admin`, contraseña `ADMIN_PASSWORD` del .env).

---

## 3. Actualización (versión nueva)

```bash
cd /opt/omni-pdms

# 1. Backup de la imagen actual y la base de datos
sudo docker save omni-pdms-server:latest -o omni-pdms-server.backup.tar
sudo docker compose exec postgres pg_dump -U omni_user omni_pdms > pre-deploy-backup.sql

# 2. Copiar y cargar la nueva imagen
scp omni-pdms-server.tar usuario@servidor:/opt/omni-pdms/   # desde la máquina dev
sudo docker load -i omni-pdms-server.tar

# 3. Recrear los servicios con la nueva imagen
sudo docker compose up -d

# 4. Verificar
curl http://localhost:9001/health
sudo docker compose ps
```

> Si `.env` o `docker-compose.yml` cambiaron, copiarlos también antes del
> paso 3.

---

## 4. Operación diaria

```bash
# Estado de los servicios
sudo docker compose ps

# Logs del backend (sigue en vivo)
sudo docker compose logs -f server

# Reiniciar el backend
sudo docker compose restart server

# Detener todo
sudo docker compose down
```

---

## 5. Rollback (volver a la versión anterior)

```bash
cd /opt/omni-pdms
sudo docker compose down
sudo docker load -i omni-pdms-server.backup.tar
sudo docker compose up -d
```

> Las migraciones de base de datos son idempotentes; el backend nuevo
> normalmente es compatible con la base existente.

---

## 6. Servidor Windows (despliegue nativo)

> En Windows Server **NO se usa Docker**: las imágenes del proyecto son Linux
> (`rust:1-slim-bookworm`, `distroless/cc-debian12`) y Windows Server no las
> ejecuta. El despliegue correcto es el binario nativo (`server.exe`) con
> PostgreSQL instalado en Windows y el proceso administrado con **NSSM**.

### 6.1 Requisitos

- Windows Server 2019/2022 (64 bits)
- [PostgreSQL 16](https://www.postgresql.org/download/windows/) — el instalador crea el servicio de Windows automáticamente
- [Node.js ≥ 20](https://nodejs.org/) — solo para compilar el frontend
- [Rust toolchain](https://rustup.rs/) — solo para compilar el servidor
- [NSSM](https://nssm.cc/) — Non-Sucking Service Manager (copiar `nssm.exe` a `C:\Windows\System32`)

### 6.2 Preparar PostgreSQL

Abrir **SQL Shell (psql)** y ejecutar:

```sql
CREATE ROLE omni_user LOGIN PASSWORD '<cambiar>';
CREATE DATABASE omni_pdms OWNER omni_user;
```

> El servicio `postgresql-x64-16` se inicia solo. Verificar con:
> `Get-Service postgresql*`

### 6.3 Compilar (en la máquina de desarrollo)

```powershell
# 1. Servidor — las migraciones van EMBEBIDAS en el binario,
#    no hace falta copiar server/migrations
cargo build --release -p server

# 2. Frontend
cd frontend
npm install
npm run build
cd ..
```

### 6.4 Instalar en el servidor

```powershell
# 1. Copiar a la máquina Windows Server:
#    - target\release\server.exe
#    - frontend\dist\  (carpeta completa)
#    - .env.example    (como .env)

# 2. Estructura final de la carpeta:
#    C:\omni-pdms\
#      server.exe
#      .env
#      frontend\dist\...

# 3. Crear C:\omni-pdms\.env (¡ajustar valores!)
#    DB_HOST=localhost
#    DB_PORT=5432
#    DB_DATABASE=omni_pdms
#    DB_USERNAME=omni_user
#    DB_PASSWORD=<cambiar>
#    PORT=9001
#    JWT_SECRET=<generar con openssl rand -hex 32>
#    ADMIN_PASSWORD=<contraseña fuerte>
#    FRONTEND_DIST=frontend/dist
```

### 6.5 Registrar como servicio (NSSM)

```powershell
nssm install omni-pdms "C:\omni-pdms\server.exe"
nssm set omni-pdms AppDirectory "C:\omni-pdms"
nssm set omni-pdms AppStdout "C:\omni-pdms\server.log"
nssm set omni-pdms AppStderr "C:\omni-pdms\server-error.log"
nssm set omni-pdms Start SERVICE_AUTO_START
nssm start omni-pdms
```

> `AppDirectory` debe apuntar a la carpeta que contiene el `.env` — el server
> lo lee desde el directorio de trabajo.

### 6.6 Abrir el puerto en el firewall

```powershell
netsh advfirewall firewall add rule name="omni-pdms 9001" dir=in action=allow protocol=TCP localport=9001
```

### 6.7 Verificar

```powershell
curl http://localhost:9001/health
# → {"status":"ok"}
```

Abrir en el navegador: `http://<ip-del-servidor>:9001`
(usuario `admin`, contraseña `ADMIN_PASSWORD` del `.env`).

### 6.8 Actualizar (versión nueva)

```powershell
# 1. Backup de la base de datos
pg_dump -U omni_user omni_pdms > pre-deploy-backup.sql

# 2. Detener, reemplazar binario + frontend, iniciar
nssm stop omni-pdms
# Copiar el nuevo server.exe y frontend\dist sobre C:\omni-pdms
nssm start omni-pdms

# 3. Verificar
curl http://localhost:9001/health
```

---

## 7. Compartir para pruebas — demo en Windows con Docker Desktop

> Para que otros usuarios de Windows prueben el sistema **sin recibir el código
> fuente**: solo se comparte la imagen precompilada + el compose + un `.env` de
> prueba. La imagen (distroless) contiene el binario compilado, la SPA y las
> migraciones embebidas — no incluye código fuente ni toolchain.

### 7.1 Archivos a compartir

| Archivo | Contenido | ¿Código fuente? |
|---|---|---|
| `omni-pdms-server.tar` | Imagen completa (backend + frontend) | No |
| `docker-compose.yml` | Receta de servicios (postgres + server) | No |
| `.env` | Configuración **de prueba** (ver abajo) | No |

Generar el `.tar` con `.\deploy.ps1` (ver sección 2.0). Compartir los 3
archivos por USB, carpeta compartida, WeTransfer, etc.

> **Seguridad**: el `.env` que se comparte debe tener valores DE PRUEBA
> (`JWT_SECRET` aleatorio, `ADMIN_PASSWORD` simple, `DB_PASSWORD` cualquiera).
> **NUNCA** compartir el `.env` de producción con secretos reales.

### 7.2 Pasos del usuario que recibe (Windows + Docker Desktop)

1. Instalar **Docker Desktop** (https://www.docker.com/products/docker-desktop/) y abrirlo.

2. Crear una carpeta (el nombre ya no importa — el compose usa el tag fijo
   `omni-pdms-server:latest`) y copiar los 3 archivos:

   ```powershell
   mkdir C:\omni-pdms-demo
   cd C:\omni-pdms-demo
   # copiar aquí omni-pdms-server.tar, docker-compose.yml y .env
   ```

3. Cargar la imagen:

   ```powershell
   docker load -i omni-pdms-server.tar
   ```

4. Levantar los servicios (`postgres:16-alpine` se descarga de Docker Hub
   automáticamente):

   ```powershell
   docker compose up -d
   ```

5. Verificar:

   ```powershell
   curl http://localhost:9001/health
   # → {"status":"ok"}
   ```

6. Abrir en el navegador: `http://localhost:9001`
   (usuario `admin`, contraseña `ADMIN_PASSWORD` del `.env` que compartiste).

### 7.3 Detener la demo

```powershell
docker compose down
```

Los datos quedan en el volumen `pgdata`. Para borrarlo todo (demo limpia):

```powershell
docker compose down -v
```

### 7.4 Notas

- El usuario NO necesita Rust, Node ni el código fuente — solo Docker Desktop.
- `docker compose up -d` usa la imagen ya cargada porque el compose declara
  `image: omni-pdms-server:latest`; si ese tag no existiera, Compose intentaría
  compilar y fallaría (por eso el fix es obligatorio).
- Para distribuir a más de 2–3 personas, mejor subir la imagen a un registro
  privado (GHCR / Docker Hub) — ver DEPLOY.md.

---

## 8. Recordatorios

- **Datos**: el volumen `pgdata` guarda la base de datos. No borrarlo salvo
  rollback estructural planificado.
- **Frontend**: la SPA va dentro de la imagen — no se copia por separado.
- **Bridge**: es un proceso nativo en la Raspberry Pi (ver DEPLOY.md), NO va
  en este servidor.
- **HTTPS**: para producción real usar un proxy inverso (Caddy/nginx) delante
  del puerto 9001 (ver DEPLOY.md).