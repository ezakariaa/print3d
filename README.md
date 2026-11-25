# 3alam3D

Site vitrine + boutique pour services d’impression 3D, vente de produits prêts et pièces à personnaliser.

## Stack

- **Frontend** : React, TypeScript, Vite, Bootstrap / React-Bootstrap
- **Backend** : Node.js, Express, TypeScript

## Structure

```
3alam3d/
  client/   # interface React
  server/   # API Express
```

## Démarrage

Dans deux terminaux :

```bash
# API (port 4000)
cd server
npm install
npm run dev

# Site (port 5173)
cd client
npm install
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173).

## Fonctionnalités

- Accueil marque **3alam3D**
- Services d’impression (FDM, résine, modélisation, séries) + devis
- Boutique (produits prêts + filtrables)
- Personnalisation (texte, couleur, taille)
- Panier et commande (API)
- Formulaire contact / devis

Les commandes et messages de contact sont journalisés côté serveur (console) — prêt à brancher e-mail ou base de données.
