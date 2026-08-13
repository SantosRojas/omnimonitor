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

## 6. Recordatorios

- **Datos**: el volumen `pgdata` guarda la base de datos. No borrarlo salvo
  rollback estructural planificado.
- **Frontend**: la SPA va dentro de la imagen — no se copia por separado.
- **Bridge**: es un proceso nativo en la Raspberry Pi (ver DEPLOY.md), NO va
  en este servidor.
- **HTTPS**: para producción real usar un proxy inverso (Caddy/nginx) delante
  del puerto 9001 (ver DEPLOY.md).