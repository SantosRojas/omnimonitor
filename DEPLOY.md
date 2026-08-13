# Implementación — omni-pdms-v2

> Documento para el personal de TI del hospital.  
> Última actualización: julio 2026

---

## Requisitos previos

En el servidor del hospital (Linux recomendado) se necesita:

- **Docker Engine** ≥ 24  
  ```bash
  sudo apt install docker.io
  sudo systemctl enable --now docker
  ```

- **Docker Compose** (plugin)  
  ```bash
  sudo apt install docker-compose-plugin
  ```

- **Podman** (alternativa a Docker)  
  Opcional. El mismo `docker-compose.yml` funciona con Podman (no usa
  `condition: service_healthy`). Instalar según la distribución:
  ```bash
  # RHEL / Fedora
  sudo dnf install podman podman-docker docker-compose-plugin

  # Debian / Ubuntu
  sudo apt install podman docker-compose
  ```

- **Git** (solo si se compila desde código directamente en el servidor)  
  ```bash
  sudo apt install git
  ```

- **Node.js** ≥ 20 (solo si se compila el frontend en el servidor)  
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt install nodejs
  ```
  > Nota: con Docker/Podman el frontend se compila **dentro de la imagen**
  > (stage `frontend-build`), por lo que Node.js solo es necesario para el
  > desarrollo local o el despliegue nativo.

---

## Inicio rápido (entorno local)

Para probar el sistema rápidamente en un entorno local o de staging:

### Con Docker (recomendado)

```bash
# 1. Clonar y configurar
cp .env.example .env
# Editar .env: JWT_SECRET, ADMIN_PASSWORD, DB_PASSWORD

# 2. Iniciar servicios (la imagen compila el frontend y el backend)
docker compose up -d

# 3. Verificar
curl http://localhost:9001/health
# → {"status":"ok"}
```

### Con Podman

El mismo `docker-compose.yml` funciona con Podman. Hay tres opciones:

```bash
# Opción 1 (recomendada): plugin docker-compose vía podman compose
cp .env.example .env
# Editar .env: JWT_SECRET, ADMIN_PASSWORD, DB_PASSWORD
podman compose up -d

# Opción 2: si existe docker-compose-plugin, usar el socket de Podman
DOCKER_HOST=unix:///run/podman/podman.sock docker compose up -d

# Opción 3: podman-compose (python)
podman-compose up -d
```

> **Nota**: las tres funcionan porque el compose **ya no usa**
> `condition: service_healthy` (que rompía `podman-compose`). El backend
> reintenta la conexión a la base de datos con backoff al arrancar.

### Sin Docker (desarrollo directo)

Requiere PostgreSQL instalado y accesible localmente.

```bash
# 1. Clonar y configurar
cp .env.example .env
# Editar .env: DB_HOST=localhost, JWT_SECRET, ADMIN_PASSWORD

# 2. Ejecutar script de desarrollo
chmod +x run.sh
./run.sh
```

El script `run.sh` construye el frontend y arranca el servidor con `cargo run -p server`.

---

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `JWT_SECRET` | **SÍ** | — | Clave secreta para firmar tokens JWT. Generar con `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | **SÍ** | — | Contraseña del usuario administrador (se crea automáticamente al iniciar) |
| `DB_HOST` | No | `localhost` | Host de PostgreSQL (en docker-compose se inyecta `postgres`) |
| `DB_PORT` | No | `5432` | Puerto de PostgreSQL |
| `DB_DATABASE` | No | `omni_pdms` | Nombre de la base de datos |
| `DB_USERNAME` | No | `omni_user` | Usuario de base de datos |
| `DB_PASSWORD` | No | `<change-this>` | Contraseña de base de datos |
| `PORT` | No | `9001` | Puerto del servidor backend |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Orígenes permitidos CORS (separados por coma) |
| `FRONTEND_DIST` | No | `frontend/dist` | Ruta al frontend compilado. Dentro del contenedor la imagen lo ubica en `/app/frontend/dist` vía env |
| `SEED_LANG` | No | `es` | Idioma de las descripciones generadas (`es` o `en`) |

---

## Despliegue a producción

El flujo de producción tiene dos máquinas:

### Paso 1: Compilar y empaquetar (máquina de desarrollo)

Ejecutar el script de despliegue desde la raíz del proyecto:

**Windows:**
```powershell
.\deploy.ps1
```

**Linux / macOS:**
```bash
chmod +x deploy.sh
./deploy.sh
```

Esto produce:
- `omni-pdms-server.tar` — imagen completa del backend **con el frontend integrado** (la SPA se compila dentro de la imagen, stage `frontend-build`)

### Paso 2: Copiar al servidor del hospital

| Método | Comando |
|---|---|
| **SCP** (red local) | `scp omni-pdms-server.tar usuario@hospital:/tmp/` |
| **USB** | Copiar el archivo `.tar` a una memoria USB |
| **Carpeta compartida** | Copiar a la carpeta de red del hospital |

También copiar:
```bash
# docker-compose.yml y .env con las credenciales de producción
scp docker-compose.yml .env usuario@hospital:/opt/omni-pdms/
```

### Paso 3: Cargar y ejecutar (servidor del hospital)

```bash
# 1. Crear directorio y moverse allí
sudo mkdir -p /opt/omni-pdms
cd /opt/omni-pdms

# 2. Copiar los archivos (si no se copiaron directamente a esta ruta)
sudo cp /tmp/omni-pdms-server.tar .

# 3. Cargar la imagen Docker
sudo docker load -i omni-pdms-server.tar

# 4. Asegurarse de que docker-compose.yml y .env están en el directorio
#    .env debe tener JWT_SECRET y ADMIN_PASSWORD configurados

# 5. Iniciar los servicios
sudo docker compose up -d
```

### Paso 4: Verificar

```bash
# Health check
curl http://localhost:9001/health
# → {"status":"ok"}

# Logs del servidor
sudo docker compose logs -f server

# Estado de los contenedores
sudo docker compose ps
```

---

## Bridge (Raspberry Pi / dispositivo separado)

El bridge no se despliega dentro de Docker. Se compila de forma nativa para
la arquitectura del dispositivo (ARM, ARM64, etc.).

### Compilación cruzada (desde máquina de desarrollo)

```bash
# Ejemplo para ARM64 (Raspberry Pi 4/5)
cargo build --release -p bridge --target aarch64-unknown-linux-gnu
```

El binario resultante está en `target/aarch64-unknown-linux-gnu/release/bridge`.

### Instalación en el dispositivo

1. Copiar el binario al dispositivo:
   ```bash
   scp target/aarch64-unknown-linux-gnu/release/bridge pi@raspberry:/opt/omni-bridge/
   ```

2. Copiar la configuración del bridge:
   ```bash
   scp bridge/.env.example pi@raspberry:/opt/omni-bridge/.env
   ```

3. Configurar el bridge como servicio systemd:

   ```ini
   # /etc/systemd/system/omni-bridge.service
   [Unit]
   Description=omni-pdms Bridge
   After=network.target

   [Service]
   Type=simple
   WorkingDirectory=/opt/omni-bridge
   ExecStart=/opt/omni-bridge/bridge
   Restart=always
   RestartSec=5
   User=pi

   [Install]
   WantedBy=multi-user.target
   ```

4. Habilitar e iniciar:
   ```bash
   sudo systemctl enable --now omni-bridge
   ```

---

## Rollback

Si una actualización falla, se puede revertir al estado anterior:

### Docker (backend)

```bash
# 1. Detener servicios actuales
sudo docker compose down

# 2. Cargar la imagen ANTERIOR (guardada antes del deploy)
sudo docker load -i omni-pdms-server.backup.tar

# 3. Re-etiquetar como latest
sudo docker tag omni-pdms-server:<version-anterior> omni-pdms-server:latest

# 4. Reiniciar
sudo docker compose up -d
```

### Base de datos

Las migraciones son acumulativas e idempotentes (usando `CREATE IF NOT EXISTS`).
- **NO** se requiere rollback de base de datos en despliegues normales
- Si se necesita una reversión estructural, restaurar desde el backup de `pgdata`:
  ```bash
  # Detener servicios
  sudo docker compose down
  # Restaurar volumen pgdata desde backup
  sudo docker volume rm omni-pdms-v2_pgdata
  # Restaurar desde backup...
  sudo docker compose up -d
  ```

### Preparación recomendada antes de cada deploy

```bash
# Guardar la imagen actual como backup
docker save omni-pdms-server:latest -o omni-pdms-server.backup.tar

# Hacer backup de la base de datos
sudo docker compose exec postgres pg_dump -U omni_user omni_pdms > pre-deploy-backup.sql
```

---

## Despliegue sin Docker (compilación nativa)

Si el servidor del hospital no tiene Docker, se puede desplegar el backend
como un binario nativo + servicio systemd.

### Requisitos

- **PostgreSQL** ≥ 16 instalado y corriendo en el servidor
- **Node.js** ≥ 20 para compilar el frontend (solo una vez)
- **Rust toolchain** para compilar el servidor (solo una vez, o compilar
  desde la máquina de desarrollo con compilación cruzada)

### Preparar PostgreSQL (sin Docker)

El backend espera un rol y una base de datos creados de antemano:

```bash
sudo -u postgres psql -c "CREATE ROLE omni_user LOGIN PASSWORD '<cambiar>';"
sudo -u postgres psql -c "CREATE DATABASE omni_pdms OWNER omni_user;"
```

Ajustar `DB_PASSWORD` en el `.env` al valor usado en el `CREATE ROLE`.

### Compilar y preparar

**Opción A — compilar en el servidor (recomendada):**

```bash
# Instalar Rust (solo una vez)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Compilar servidor (las migraciones van EMBEBIDAS en el binario,
# no hace falta copiar server/migrations)
cargo build --release -p server

# Compilar frontend
cd frontend && npm install && npm run build && cd ..
```

**Opción B — compilar desde máquina de desarrollo y copiar:**

```bash
# Compilar para Linux x86_64 (desde Linux o WSL, o con toolchain cruzada)
cargo build --release -p server --target x86_64-unknown-linux-gnu

# Empaquetar (el binario queda en target/<target>/release/server)
tar czf omni-pdms-native.tar.gz \
    target/x86_64-unknown-linux-gnu/release/server \
    frontend/dist \
    .env.example

# Copiar al servidor
scp omni-pdms-native.tar.gz usuario@hospital:/opt/omni-pdms/
```

> **Advertencia honesta sobre la compilación cruzada**: compilar para
> `x86_64-unknown-linux-gnu` desde **macOS o Windows** requiere toolchain
> cruzada (p. ej. `cargo-zigbuild` o `cross`); sin ella, el binario no es
> ejecutable en el servidor Linux. En esas plataformas, compilar directamente
> en el servidor (**Opción A**) o instalar la toolchain cruzada.

> **Nota sobre `FRONTEND_DIST`**: el valor `/app/frontend/dist` del
> `.env.example` es la ruta DENTRO del contenedor. En despliegue nativo ese
> valor rompe la SPA → setear `FRONTEND_DIST=frontend/dist` (relativo al
> `WorkingDirectory` de systemd) o la ruta absoluta del `dist`.

### Instalar como servicio systemd

```bash
# 1. Crear directorio
sudo mkdir -p /opt/omni-pdms
cd /opt/omni-pdms

# 2. Extraer binario y frontend
tar xzf omni-pdms-native.tar.gz

# 3. Configurar .env
cp .env.example .env
# Editar .env con las credenciales de producción.
# IMPORTANTE: setear FRONTEND_DIST=frontend/dist (ver nota arriba), no el
# valor /app/frontend/dist del ejemplo (es la ruta de contenedor).

# 4. Crear servicio systemd
sudo tee /etc/systemd/system/omni-pdms.service > /dev/null <<'SERVICE'
[Unit]
Description=omni-pdms-v2 Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/omni-pdms
ExecStart=/opt/omni-pdms/server
Restart=always
RestartSec=5
User=omni-pdms

[Install]
WantedBy=multi-user.target
SERVICE

# 5. Crear usuario del servicio
sudo useradd -r -s /bin/false omni-pdms
sudo chown -R omni-pdms:omni-pdms /opt/omni-pdms

# 6. Habilitar e iniciar
sudo systemctl daemon-reload
sudo systemctl enable --now omni-pdms

# 7. Verificar
curl http://localhost:9001/health
# → {"status":"ok"}
```

### Rollback (versión nativa)

```bash
# Guardar binario anterior antes de actualizar
cp /opt/omni-pdms/server /opt/omni-pdms/server.backup

# Restaurar
sudo systemctl stop omni-pdms
cp /opt/omni-pdms/server.backup /opt/omni-pdms/server
sudo systemctl start omni-pdms
```

---

## TLS / Proxy inverso (recomendación)

Para servir tráfico HTTPS y/o redirigir del puerto 443 al 9001, se recomienda
usar un proxy inverso como **nginx** o **Caddy**.

### Ejemplo con Caddy (más simple)

```caddyfile
# /etc/caddy/Caddyfile
hospital.pdms.example.com {
    reverse_proxy localhost:9001
}
```

```bash
sudo apt install caddy
sudo systemctl enable --now caddy
```

### Ejemplo con nginx

```nginx
# /etc/nginx/sites-available/omni-pdms
server {
    listen 443 ssl;
    server_name hospital.pdms.example.com;

    ssl_certificate     /etc/ssl/certs/hospital.pdms.example.com.pem;
    ssl_certificate_key /etc/ssl/private/hospital.pdms.example.com.key;

    location / {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";  # necesario para WebSocket
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/omni-pdms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> **Nota**: WebSocket requiere `proxy_set_header Upgrade` y `Connection "upgrade"`.
> Sin estas líneas, las conexiones en tiempo real (monitor de pacientes, bridge)
> fallarán silenciosamente.
