/**
 * Every user-facing string in the patient app. Spanish (es-MX) only for now — the
 * product is Mexico-only (open decision #11). Keep strings here, never inline in
 * screens, so wording stays consistent and a real i18n library can replace this later.
 *
 * Voice: informal "tú", short and warm. Legal texts (consents) must match the
 * published documents word for word; have them reviewed before launch.
 */
export const es = {
  common: {
    genericError: 'Algo salió mal. Inténtalo de nuevo.',
    networkError: 'Algo salió mal. Revisa tu conexión e inténtalo de nuevo.',
    comingSoon: 'Próximamente.',
    signOut: 'Cerrar sesión',
    yourNutritionist: 'tu nutriólogo',
  },

  invite: {
    title: 'Ingresa tu código de invitación',
    subtitle: (name: string) => `${name} te envió un código personal para crear tu cuenta.`,
    subtitleFallback: 'Tu nutriólogo te envió un código personal para crear tu cuenta.',
    inputLabel: 'Código de invitación',
    continue: 'Continuar',
    checking: 'Verificando…',
    noCode: '¿No tienes un código? Pídeselo a tu nutriólogo.',
    back: 'Volver a iniciar sesión',
    haveCode: '¿Tienes un código de invitación? Ingrésalo',
    codeApplied: (code: string) => `Código de invitación: ${code}`,
    errors: {
      invalid: 'Ese código no es válido o ya se usó. Revísalo o pide uno nuevo a tu nutriólogo.',
      suspended: 'Este servicio no está disponible por ahora. Contacta a tu nutriólogo.',
      rateLimited: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
    },
  },

  auth: {
    welcome: 'Hola',
    email: 'Correo electrónico',
    password: 'Contraseña',
    firstName: 'Nombre',
    lastName: 'Apellidos',
    signIn: 'Iniciar sesión',
    signingIn: 'Iniciando sesión…',
    toSignUp: '¿Primera vez aquí? Crea una cuenta',
    signUpTitle: 'Crea tu cuenta',
    signUp: 'Crear cuenta',
    signingUp: 'Creando cuenta…',
    toSignIn: '¿Ya tienes cuenta? Inicia sesión',
    consentPrivacy: 'He leído el aviso de privacidad.',
    consentSensitive:
      'Otorgo mi consentimiento expreso para que se traten mis datos de salud y nutrición, a fin de que mi nutriólogo pueda darme seguimiento.',
    consentTerms: 'Acepto los términos y condiciones.',
    confirmTitle: 'Revisa tu correo',
    confirmBody: (email: string) =>
      `Enviamos un código de verificación a ${email}. Ingrésalo para terminar de crear tu cuenta.`,
    confirmCode: 'Código de verificación',
    confirm: 'Confirmar',
    confirmingCode: 'Confirmando…',
    confirmCodeWrong: 'Ese código no funcionó. Revisa tu correo e inténtalo de nuevo.',
    errors: {
      wrongCredentials: 'Correo o contraseña incorrectos.',
      notConfirmed: 'Aún no confirmas tu correo. Revisa tu bandeja de entrada.',
      weakPassword: 'La contraseña debe tener al menos 10 caracteres, con mayúsculas, minúsculas y números.',
      tooManyAttempts: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
      accountExists: 'Esta cuenta ya existe. Intenta iniciar sesión.',
      otherPractice: 'Esta cuenta pertenece a otro nutriólogo.',
      unavailable: 'Este servicio no está disponible por ahora.',
      inviteExpired: 'Tu código de invitación ya no es válido. Pide uno nuevo a tu nutriólogo.',
      invalidData: 'Revisa los datos e inténtalo de nuevo.',
    },
  },

  unavailable: {
    title: 'Servicio no disponible',
    body: 'Este servicio no está disponible por ahora. Contacta a tu nutriólogo.',
  },

  home: {
    title: 'Tu plan',
    signedInAs: (email: string) => `Sesión iniciada como ${email}`,
  },

  nav: {
    meals: 'Comidas',
    recipes: 'Recetas',
    progress: 'Progreso',
    ai: 'Pregúntale a la IA',
    aiShort: 'IA',
    profile: 'Perfil',
  },

  profile: {
    support: (email: string) => `Soporte: ${email}`,
  },

  subscription: {
    title: 'Suscripción',
    body: (name: string) => `Suscríbete para acceder a tus planes de alimentación, recetas y al chat con ${name}.`,
    currentStatus: (status: string) => `Estado actual: ${status}`,
    subscribe: 'Suscribirme (aún no disponible)',
    restore: 'Restaurar compras',
    status: {
      PENDING: 'Pendiente',
      TRIALING: 'Periodo de prueba',
      ACTIVE: 'Activa',
      GRACE_PERIOD: 'Periodo de gracia',
      PAST_DUE: 'Pago vencido',
      CANCELED: 'Cancelada',
      EXPIRED: 'Vencida',
      REFUNDED: 'Reembolsada',
    },
  },
} as const;

export const t = es;
