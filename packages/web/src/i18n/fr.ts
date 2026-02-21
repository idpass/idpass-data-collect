/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export default {
  common: {
    logout: 'Déconnexion',
    backToHome: "Retour à l'accueil",
    cancel: 'Annuler',
    close: 'Fermer',
    retry: 'Réessayer',
    loading: 'Chargement...',
    submit: 'Soumettre',
    agent: 'Agent',
    citizen: 'Citoyen',
  },
  citizenLogin: {
    title: 'Portail Citoyen',
    enterProgramId:
      'Entrez votre identifiant de programme pour accéder à vos données.',
    programIdLabel: 'Identifiant du programme',
    programIdPlaceholder: 'ex. registre-menages-demo',
    continue: 'Continuer',
    selfServiceDisabled:
      "Le libre-service n'est pas activé pour ce programme.",
    loginWithEsignet: 'Se connecter avec eSignet',
    oidcNotConfigured:
      "La connexion OIDC n'est pas configurée pour ce programme. Contactez votre administrateur.",
    chooseDifferentProgram: 'Choisir un autre programme',
    programNotFound: 'Programme introuvable ou indisponible.',
    oidcStartFailed: 'Échec du démarrage de la connexion. Veuillez réessayer.',
  },
  dashboard: {
    welcome: 'Bienvenue, {name}',
    manageProfile:
      'Gérez votre profil et soumettez des demandes de modification.',
    myProfile: 'Mon Profil',
    viewPersonalInfo: 'Consultez vos informations personnelles',
    submissions: 'Soumissions',
    viewHistory: "Consultez l'historique de vos demandes",
    submitChangeRequest: 'Soumettre une demande de modification',
  },
  profile: {
    title: 'Mon Profil',
    lastUpdated: 'Dernière mise à jour : {date}',
    fieldColumn: 'Champ',
    valueColumn: 'Valeur',
  },
  changeRequest: {
    updateInfo: 'Mettre à jour vos informations',
    noEditableFields: 'Aucun champ modifiable disponible.',
    submitChangeRequest: 'Soumettre la demande de modification',
    submitted:
      'Votre demande de modification a été soumise. Redirection vers les soumissions...',
    failedToLoad: 'Échec du chargement du formulaire',
    submissionFailed: 'Échec de la soumission',
  },
  submissionHistory: {
    title: 'Historique des soumissions',
    submitted: 'Soumis le {date}',
    noSubmissions:
      "Aucune soumission pour le moment. Soumettez une demande de modification depuis votre tableau de bord.",
  },
  oidcCallback: {
    processing: "Traitement de l'authentification...",
    verifying: "Vérification de l'identité...",
    exchanging: 'Échange des identifiants...',
    success: 'Connexion réussie ! Redirection...',
    noResponse:
      "Échec de l'authentification. Aucune réponse du fournisseur d'identité.",
    incomplete: "La réponse d'authentification est incomplète.",
    noRecord:
      'Aucun enregistrement de bénéficiaire correspondant trouvé. Veuillez contacter votre administrateur.',
    verifyFailed:
      "Nous n'avons pas pu vérifier votre identité. Veuillez réessayer ou contacter l'administrateur de votre programme.",
    backToLogin: 'Retour à la connexion',
  },
  header: {
    appName: 'ID PASS DataCollect',
  },
  status: {
    pending: 'En cours de révision',
    approved: 'Approuvé',
    rejected: 'Rejeté',
  },
  agentLogin: {
    title: 'Connexion Agent',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    login: 'Se connecter',
    invalidCredentials: 'Adresse e-mail ou mot de passe invalide',
    noPrograms:
      'Aucun programme attribué à ce compte. Contactez votre administrateur.',
    selectProgram: 'Sélectionner un programme',
    chooseProgram: 'Choisissez un programme :',
    backToLogin: 'Retour à la connexion',
  },
}
