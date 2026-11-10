// config/swagger.js — OpenAPI 3.0 Specification for GMT Ariana Planning Medical
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'GMT Ariana — API Planning Médical',
    version: '1.0.0',
    description: `
### Documentation Interactive de l'API GMT Ariana
Plateforme de planification médicale du travail (GMT Ariana).
- **Authentification** : JWT Bearer Token, Biométrie WebAuthn (Face ID / Empreinte), 2FA.
- **WhatsApp Gratuit** : Liens directs préformatés pour reset mot de passe et partage d'accès.
- **Rôles** : \`administrateur\`, \`medecin\`, \`technicien\`, \`chauffeur\`.
    `,
    contact: {
      name: 'GMT Ariana Administration',
      email: 'admin@gmt-ariana.tn',
    },
  },
  servers: [
    { url: 'http://localhost:8083', description: 'Serveur Local de Développement' },
    { url: 'https://projet-planning.onrender.com', description: 'Serveur de Production (Render)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Entrez votre token JWT obtenu via /api/auth/login',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nom: { type: 'string', example: 'Benali' },
          prenom: { type: 'string', example: 'Sophie' },
          email: { type: 'string', example: 'sophie.benali@gmt-ariana.tn' },
          telephone: { type: 'string', example: '+216 98 123 456' },
          role: { type: 'string', enum: ['administrateur', 'medecin', 'technicien', 'chauffeur'], example: 'medecin' },
          is_active: { type: 'integer', example: 1 },
        },
      },
      Entreprise: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 10 },
          code: { type: 'string', example: 'ENT-2026-001' },
          nom: { type: 'string', example: 'Société Industrielle Ariana' },
          secteur: { type: 'string', example: 'Textile' },
          adresse: { type: 'string', example: 'Zone Industrielle Charguia' },
          telephone: { type: 'string', example: '71 123 456' },
          email: { type: 'string', example: 'contact@sia.tn' },
          effectif_total: { type: 'integer', example: 150, description: 'Nombre total de salariés / patients' },
          nb_visites_faites: { type: 'integer', example: 45, description: 'Nombre de salariés examinés' },
          nb_bilans_faits: { type: 'integer', example: 40 },
          nb_bilans_manquants: { type: 'integer', example: 5 },
          annee_campagne: { type: 'integer', example: 2026 },
        },
      },
      PlanningEvent: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          titre: { type: 'string', example: 'Visite médicale d embauche' },
          date: { type: 'string', format: 'date', example: '2026-11-15' },
          heure_debut: { type: 'string', example: '08:30' },
          heure_fin: { type: 'string', example: '12:30' },
          adresse: { type: 'string', example: 'Rue de l usine, Ariana' },
          medecin_id: { type: 'integer', example: 2 },
          technicien_id: { type: 'integer', example: 3 },
        },
      },
      ClinoSortie: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          date: { type: 'string', format: 'date', example: '2026-11-16' },
          heure: { type: 'string', example: '09:00' },
          adresse: { type: 'string', example: 'Parc Technologique El Ghazala' },
          medecin_id: { type: 'integer', example: 2 },
          technicien_id: { type: 'integer', example: 3 },
          commentaire: { type: 'string', example: 'Tournée mobile unité 1' },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'État de santé du serveur',
        description: 'Retourne { status: "ok" } si le serveur backend est en ligne.',
        responses: {
          200: {
            description: 'Serveur opérationnel',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } },
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Connexion utilisateur',
        description: 'Authentification avec email et mot de passe. Retourne le token JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@gmt-ariana.tn' },
                  password: { type: 'string', example: 'Password123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Connexion réussie avec token JWT' },
          401: { description: 'Identifiants invalides' },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Mot de passe oublié (Lien WhatsApp direct ou Email)',
        description: 'Génère un token sécurisé de réinitialisation et retourne un lien direct WhatsApp (`whatsapp_link`) ou envoie un e-mail.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['identifier'],
                properties: {
                  identifier: { type: 'string', example: '98123456 ou doctor@gmt-ariana.tn' },
                  method: { type: 'string', enum: ['email', 'phone'], example: 'phone' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Lien WhatsApp généré avec succès' },
        },
      },
    },
    '/api/auth/reset-password': {
      get: {
        tags: ['Auth'],
        summary: 'Vérifier la validité d un token de réinitialisation',
        parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Token valide' },
          400: { description: 'Token invalide ou expiré' },
        },
      },
      post: {
        tags: ['Auth'],
        summary: 'Réinitialiser le mot de passe avec le token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'new_password'],
                properties: {
                  token: { type: 'string' },
                  new_password: { type: 'string', example: 'NouveauPass456!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mot de passe mis à jour' },
          400: { description: 'Erreur ou token expiré' },
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'Lister tous les utilisateurs (Authentifié)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Liste des utilisateurs', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Créer un utilisateur avec identifiants et lien WhatsApp (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nom', 'prenom', 'email', 'role'],
                properties: {
                  nom: { type: 'string', example: 'Benali' },
                  prenom: { type: 'string', example: 'Sophie' },
                  email: { type: 'string', example: 'dr.benali@gmt-ariana.tn' },
                  role: { type: 'string', enum: ['medecin', 'technicien', 'administrateur', 'chauffeur'] },
                  telephone: { type: 'string', example: '+216 98 123 456' },
                  password: { type: 'string', example: 'InitPass789!' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Utilisateur créé avec mot de passe temporaire et OTP' },
          403: { description: 'Accès refusé (Admin uniquement)' },
        },
      },
    },
    '/api/users/{id}/resend-welcome': {
      post: {
        tags: ['Users'],
        summary: 'Renvoyer les identifiants et regénérer l accès WhatsApp (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Accès regénérés' },
        },
      },
    },
    '/api/users/{id}/reset-password': {
      post: {
        tags: ['Users'],
        summary: 'Réinitialiser le mot de passe d un utilisateur directement (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { password: { type: 'string', example: 'CustomNewPass123' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Mot de passe réinitialisé' },
        },
      },
    },
    '/api/entreprises': {
      get: {
        tags: ['Entreprises'],
        summary: 'Lister les entreprises conventionnées et effectifs',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Liste des entreprises', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Entreprise' } } } } },
        },
      },
      post: {
        tags: ['Entreprises'],
        summary: 'Créer une entreprise (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nom'],
                properties: {
                  nom: { type: 'string', example: 'Clinique de l Ariana' },
                  secteur: { type: 'string', example: 'Santé' },
                  effectif_total: { type: 'integer', example: 120 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Entreprise créée' },
        },
      },
    },
    '/api/entreprises/{id}/bilan': {
      patch: {
        tags: ['Entreprises'],
        summary: 'Modifier rapidement l effectif de patients et le bilan (Admin / Médecin / Technicien)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  effectif_total: { type: 'integer', example: 140, description: 'Modifiable par Admin' },
                  nb_visites_faites: { type: 'integer', example: 60, description: 'Salariés examinés' },
                  nb_bilans_faits: { type: 'integer', example: 55 },
                  nb_bilans_manquants: { type: 'integer', example: 5 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Effectif et bilan mis à jour avec succès' },
        },
      },
    },
    '/api/entreprises/{id}/visites': {
      post: {
        tags: ['Entreprises'],
        summary: 'Enregistrer une visite médicale et additionner l effectif examiné (Admin / Médecin / Tech)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'nb_examines'],
                properties: {
                  date: { type: 'string', format: 'date', example: '2026-11-15' },
                  nb_examines: { type: 'integer', example: 15, description: 'Nombre de patients examinés ce jour' },
                  nb_bilans: { type: 'integer', example: 12 },
                  type_visite: { type: 'string', example: 'Visite Périodique' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Visite enregistrée et effectif cumulé' },
        },
      },
    },
    '/api/planning': {
      get: {
        tags: ['Planning'],
        summary: 'Consulter le planning des interventions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'start', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'end', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Liste des interventions' },
        },
      },
      post: {
        tags: ['Planning'],
        summary: 'Créer une intervention dans le planning (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['titre', 'date'],
                properties: {
                  titre: { type: 'string', example: 'Visite Médicale Périodique' },
                  date: { type: 'string', format: 'date', example: '2026-11-20' },
                  heure_debut: { type: 'string', example: '08:00' },
                  heure_fin: { type: 'string', example: '13:00' },
                  adresse: { type: 'string', example: 'Zone Industrielle Charguia' },
                  medecin_id: { type: 'integer', example: 2 },
                  technicien_id: { type: 'integer', example: 3 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Intervention créée' },
        },
      },
    },
    '/api/clino': {
      get: {
        tags: ['Clino Mobile'],
        summary: 'Consulter les sorties de l unité mobile Clino',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Liste des sorties Clino Mobile' },
        },
      },
      post: {
        tags: ['Clino Mobile'],
        summary: 'Programmer une sortie Clino Mobile (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'adresse'],
                properties: {
                  date: { type: 'string', format: 'date', example: '2026-11-22' },
                  heure: { type: 'string', example: '09:00' },
                  adresse: { type: 'string', example: 'Tunis Carthage' },
                  medecin_id: { type: 'integer', example: 2 },
                  technicien_id: { type: 'integer', example: 3 },
                  commentaire: { type: 'string', example: 'Dépistage annuel' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Sortie Clino créée' },
        },
      },
    },
  },
};

function setupSwagger(app) {
  const options = {
    customCss: `
      .swagger-ui .topbar { background-color: #0284c7; }
      .swagger-ui .topbar .wrapper .topbar-wrapper a span { font-weight: 800; }
    `,
    customSiteTitle: 'Documentation API — GMT Ariana Planning Médical',
    customfavIcon: '/icon-192.png',
  };

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, options));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  console.log('[Swagger] 📖 Documentation OpenAPI active sur /api-docs');
}

module.exports = { setupSwagger, swaggerSpec };
