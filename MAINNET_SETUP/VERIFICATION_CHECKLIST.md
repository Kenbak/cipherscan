# ✅ Mainnet Server Verification Checklist

## 1. Vérifier le Resize du Serveur

```bash
# SSH sur le serveur mainnet
ssh root@your-mainnet-server-ip

# Vérifier les specs
lscpu | grep "CPU(s)"          # Devrait montrer 8 CPUs
free -h                        # Devrait montrer 16 GB RAM
df -h                          # Devrait montrer 320 GB storage
```

**Attendu** :
- ✅ 8 vCPUs
- ✅ 16 GB RAM
- ✅ 320 GB Storage

---

## 2. Vérifier l'État Actuel du Serveur

```bash
# Vérifier si Zebra tourne déjà
systemctl status zebrad || systemctl status zcashd

# Vérifier PostgreSQL
systemctl status postgresql

# Vérifier l'espace disque utilisé
du -sh /var/lib/zebrad-cache 2>/dev/null || echo "Zebra cache not found"
du -sh ~/.zcash 2>/dev/null || echo "Zcashd data not found"

# Vérifier les ports
ss -tulpn | grep -E ':(8232|8233|5432)'
```

---

## 3. Backup de la Config Existante (si elle existe)

```bash
# Créer un dossier de backup
mkdir -p ~/backup-$(date +%Y%m%d)

# Backup des configs existantes
cp -r /etc/zebrad ~/backup-$(date +%Y%m%d)/ 2>/dev/null || echo "No zebrad config"
cp -r ~/.zcash ~/backup-$(date +%Y%m%d)/ 2>/dev/null || echo "No zcashd config"
cp /etc/nginx/sites-available/* ~/backup-$(date +%Y%m%d)/ 2>/dev/null || echo "No nginx config"

echo "✓ Backup saved to ~/backup-$(date +%Y%m%d)/"
```

---

## 4. Vérifier les Services Existants

```bash
# Lister tous les services Zcash/Zebra
systemctl list-units --all | grep -E '(zcash|zebra)'

# Vérifier les cron jobs
crontab -l

# Vérifier les processus en cours
ps aux | grep -E '(zcash|zebra|node)'
```

---

## 5. Vérifier la Base de Données PostgreSQL

```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans psql:
\l                              # Lister les databases
\c zcash_mainnet                # Se connecter (si existe)
\dt                             # Lister les tables
SELECT COUNT(*) FROM blocks;    # Vérifier les données
\q                              # Quitter
```

---

## 6. Vérifier Nginx

```bash
# Vérifier la config Nginx
nginx -t

# Lister les sites actifs
ls -la /etc/nginx/sites-enabled/

# Vérifier les certificats SSL
certbot certificates
```

---

## 7. Checklist Finale Avant Setup

- [ ] Serveur resizé à 8 vCPU / 16 GB / 320 GB
- [ ] Backup de la config existante fait
- [ ] Services existants identifiés
- [ ] PostgreSQL accessible
- [ ] Nginx configuré
- [ ] Ports 8232, 8233, 5432 disponibles
- [ ] Espace disque suffisant (>200 GB libre)

---

## 8. Prêt pour le Setup !

Une fois toutes les vérifications faites, on peut :
1. Copier les fichiers de config
2. Lancer le script `setup-mainnet.sh`
3. Télécharger le snapshot (optionnel)
4. Démarrer Zebra
5. Démarrer l'indexer
6. Démarrer l'API

**Commande pour copier les fichiers** :
```bash
# Depuis ton PC local
scp -r MAINNET_SETUP/* root@your-mainnet-server:/root/mainnet-setup/
```

**Ensuite sur le serveur** :
```bash
cd /root/mainnet-setup
chmod +x setup-mainnet.sh
sudo ./setup-mainnet.sh
```
