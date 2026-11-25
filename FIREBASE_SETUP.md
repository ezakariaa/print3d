# Configuration Firebase

L’Espace Client de gestion et les demandes de devis utilisent Firebase Authentication, Cloud Firestore et Cloud Storage. Le site public peut rester consultable avant la configuration, mais la connexion de gestion, l’enregistrement des commandes et l’envoi des fichiers nécessitent un projet Firebase.

## Préparer le projet

1. Crée un projet dans la console Firebase et une application Web.
2. Active Authentication avec les méthodes **E-mail/Mot de passe** et **Anonyme**.
3. Crée une base Cloud Firestore et un bucket Cloud Storage.
4. Copie les paramètres publics de l’application Web dans `client/.env` à partir de `client/.env.example`.
5. Crée `server/.env` à partir de `server/.env.example`, puis renseigne `PROJECT_ID`, `STORAGE_BUCKET` et `ADMIN_EMAIL`. Le serveur local charge ce fichier au démarrage ; Firebase le charge aussi lors du déploiement. `ADMIN_EMAIL` doit être l’adresse vérifiée autorisée à gérer le site.
6. Dans Firebase Authentication, crée l’utilisateur correspondant à `ADMIN_EMAIL` et vérifie son adresse.
7. Installe la CLI Firebase et connecte-toi au projet (`firebase login`, puis `firebase use <id-du-projet>`).
8. Construis le client avec `npm run build --prefix client`, puis déploie les règles, la fonction API et le site avec `firebase deploy`.

La fonction utilise les identifiants de service fournis automatiquement par Firebase. Ne place jamais de clé de compte de service dans le client ou dans le dépôt. Pour faire fonctionner le serveur localement avec Firestore, configure les identifiants Google Application Default Credentials.

## Fonctionnement

- Les demandes de devis acceptent un fichier STL ou OBJ, jusqu’à 50 Mo par fichier. Le fichier est envoyé dans un dossier Storage privé associé à une session Firebase anonyme. Seul l’administrateur authentifié peut obtenir une URL temporaire de téléchargement.
- Pour générer les liens temporaires, le compte de service d’exécution de la fonction doit pouvoir signer ses propres jetons (`roles/iam.serviceAccountTokenCreator`).
- Les données de commandes, demandes de devis, produits et services modifiés sont conservées dans Firestore. Les règles bloquent l’accès direct depuis les clients ; l’API vérifie les jetons Firebase et réserve `/api/admin` à l’adresse `ADMIN_EMAIL`.
- Les informations du profil connecté sont enregistrées dans `Users/{uid}`. L’API vérifie le jeton et n’autorise chaque compte qu’à consulter ou modifier son propre profil ; l’adresse e-mail est reprise du compte Firebase.
- L’Espace Client permet de consulter les utilisateurs Firebase et d’activer ou désactiver leur compte, ainsi que de gérer les produits, services, commandes et devis. Le compte correspondant à `ADMIN_EMAIL` ne peut pas être désactivé depuis l’interface.
- Le catalogue initial de produits et services reste fourni par le serveur. Les modifications effectuées dans l’Espace Client sont enregistrées dans Firestore.
- Le paiement en ligne n’est pas encore activé : il faudra choisir un prestataire et configurer ses secrets côté serveur avant de pouvoir encaisser réellement.
