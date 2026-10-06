/**
 * Every user-facing string in the patient app. Spanish (es-MX) only for now — the
 * product is Mexico-only (open decision #11). Keep strings here, never inline in
 * screens, so wording stays consistent. A typed object instead of i18next: one locale,
 * and a missing key is a compile error. Numbers, units and dates go through ./format.
 *
 * Voice: informal "tú", short and warm. Legal texts (consents) must match the
 * published documents word for word; have them reviewed before launch.
 */
/** Food names are stored capitalized ("Pechuga de pollo"); mid-sentence they read lowercase. */
const midSentence = (name: string) => name.charAt(0).toLocaleLowerCase('es-MX') + name.slice(1);

export const es = {
  /** Short macro names, for chips and bars. */
  macros: {
    protein: (g: string) => `Proteína ${g}`,
    carbs: (g: string) => `Carbs ${g}`,
    fat: (g: string) => `Grasa ${g}`,
    /** Single letters for the day summary: "P 112 g". */
    proteinShort: (g: string) => `P ${g}`,
    carbsShort: (g: string) => `C ${g}`,
    fatShort: (g: string) => `G ${g}`,
    proteinLabel: 'Proteína',
    carbsLabel: 'Carbs',
    fatLabel: 'Grasa',
  },

  goals: {
    cardTitle: 'Tu meta',
    setTitle: 'Define tu meta',
    setBody: 'Cuéntanos hacia dónde quieres avanzar y ajustamos tu plan.',
    setButton: 'Definir mi meta',
    change: 'Cambiar mi meta',
    /** Step titles. */
    intentionQuestion: '¿Hacia dónde te gustaría avanzar?',
    loseDetails: '¿A qué ritmo te gustaría bajar?',
    gainDetails: '¿A qué ritmo te gustaría subir?',
    otherDetails: '¿Qué te gustaría lograr?',
    screeningQuestion: 'En los últimos 3 meses, ¿tu peso cambió?',
    resultTitle: 'Tu plan',
    step: (n: number, total: number) => `Paso ${n} de ${total}`,
    next: 'Continuar',
    save: 'Guardar mi meta',
    saving: 'Guardando…',
    done: 'Listo',
    saveFailed: 'No pudimos guardar tu meta. Inténtalo de nuevo.',
    loadFailed: 'No pudimos cargar tu meta. Revisa tu conexión.',
    retry: 'Reintentar',
    intentions: {
      LOSE_WEIGHT: { label: 'Bajar de peso', hint: 'Con un plan gradual y seguro.' },
      MAINTAIN_WEIGHT: { label: 'Mantener mi peso', hint: 'Seguir como estás, comiendo bien.' },
      GAIN_WEIGHT: { label: 'Subir de peso', hint: 'Aumentar poco a poco.' },
      NUTRITION_QUALITY: { label: 'Comer mejor', hint: 'Mejorar la calidad de lo que comes.' },
      BUILD_MUSCLE: { label: 'Ganar músculo', hint: 'Con más proteína y ejercicio de fuerza.' },
      OTHER: { label: 'Otra cosa', hint: 'Cuéntanos y lo platicas con tu nutriólogo.' },
    },
    paces: {
      GENTLE: { label: 'Gradual', hint: 'Poco a poco: más fácil de sostener.' },
      MODERATE: { label: 'Moderado', hint: 'Un ritmo constante.' },
      FAST: { label: 'Más rápido', hint: 'Pide más constancia.' },
    },
    desiredLose: '¿Cuántos kilos te gustaría bajar? (opcional)',
    desiredGain: '¿Cuántos kilos te gustaría subir? (opcional)',
    desiredPlaceholder: 'Por ejemplo, 5',
    desiredInvalid: 'Escribe un número entre 0.5 y 150.',
    otherPlaceholder: 'Por ejemplo, tener más energía en el día',
    otherRequired: 'Cuéntanos en pocas palabras.',
    recentChanges: {
      STABLE: 'Se mantuvo',
      LOST: 'Bajé más de 5 kg',
      GAINED: 'Subí más de 5 kg',
      UNSURE: 'No estoy seguro',
    },
    medicalNote: 'Si tienes una condición médica o tomas medicamentos, consulta a tu nutriólogo antes de empezar.',
    /** The explanation after saving. `kcal` is "1,740 kcal". */
    explain: {
      wantsLose: (kg: string) => `Te gustaría bajar ${kg}.`,
      wantsGain: (kg: string) => `Te gustaría subir ${kg}.`,
      lose: (pace: string, kcal: string) => `Con tu perfil empezaremos con una meta ${pace} para bajar de peso: ${kcal} al día.`,
      gain: (pace: string, kcal: string) => `Con tu perfil empezaremos con una meta ${pace} para subir de peso: ${kcal} al día.`,
      paceAdjectives: { GENTLE: 'gradual', MODERATE: 'moderada', FAST: 'más rápida' },
      maintain: (kcal: string) => `Tu meta es mantener tu peso: ${kcal} al día.`,
      quality: (kcal: string) => `Nos enfocaremos en la calidad de lo que comes, con ${kcal} al día para mantener tu peso.`,
      leanGain: (kcal: string) =>
        `Para ganar músculo empezaremos con un aumento pequeño: ${kcal} al día, con más proteína. Combínalo con ejercicio de fuerza.`,
      other: (kcal: string) => `Por ahora tu plan mantiene tu peso (${kcal} al día). Platica con tu nutriólogo sobre lo que te gustaría lograr.`,
      recentLoss: (kcal: string) =>
        `Como bajaste de peso hace poco, empezaremos manteniendo tu peso (${kcal} al día). Platica con tu nutriólogo antes de bajar más.`,
      tooLow: (kcal: string) =>
        `El peso que te gustaría alcanzar está por debajo de un rango saludable, así que empezaremos manteniendo tu peso (${kcal} al día). Platica con tu nutriólogo.`,
      nextWeek: 'Tu plan de comidas se ajustará a partir de la próxima semana.',
    },
  },

  progress: {
    title: 'Tu progreso',
    goal: (kg: string) => `Meta: ${kg}`,
    remaining: (kg: string) => `faltan ${kg}`,
    reached: '¡Meta alcanzada!',
    /** Under the goal bar: "78 kg · 18 ago". */
    start: (kg: string, date: string) => `${kg} · ${date}`,
    weight: 'Peso',
    period: 'Periodo',
    periods: { weeks8: '8 sem', months3: '3 meses', all: 'Todo' },
    today: 'Hoy',
    chartA11y: (from: string, to: string) => `Tu peso pasó de ${from} a ${to}.`,
    logWeight: 'Registrar peso',
    measurements: { waist: 'Cintura', hip: 'Cadera', bodyFat: 'Grasa' },
    water: 'Agua',
    waterToday: (drunk: string, goal: string) => `${drunk} de ${goal} hoy`,
    addWater: '+250 ml',
    addWaterA11y: 'Agregar un vaso de 250 ml',
    soonTitle: 'Muy pronto',
    soonBody: 'Aquí verás tu peso, tus medidas y el agua que tomas. Estamos terminando esta sección.',
  },

  common: {
    genericError: 'Algo salió mal. Inténtalo de nuevo.',
    networkError: 'Algo salió mal. Revisa tu conexión e inténtalo de nuevo.',
    comingSoon: 'Próximamente.',
    signOut: 'Cerrar sesión',
    yourNutritionist: 'tu nutriólogo',
    back: 'Volver',
    close: 'Cerrar',
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
    greeting: (name: string) => `Hola, ${name}`,
    greetingNoName: 'Hola',
    openProfile: 'Abrir tu perfil',
    weightGoal: 'Meta de peso',
    planThisWeek: 'Plan esta semana',
    caloriesToday: 'Calorías hoy',
    /** Under the big number in the ring: "−4.2" over "kg de 7 kg". */
    kgOfGoal: (goal: string) => `kg de ${goal}`,
    /** Under the kcal eaten: "1,240" over "de 1,800 kcal". */
    ofKcal: (target: string) => `de ${target}`,
    ringA11y: (outer: string, outerValue: string, inner?: string, innerValue?: string) =>
      inner ? `${outer}: ${outerValue}. ${inner}: ${innerValue}.` : `${outer}: ${outerValue}.`,
    streakOne: 'día de racha',
    streakOther: 'días de racha',
    mealsToday: 'comidas hoy',
    yourWeight: 'Tu peso',
    weeks: (count: number) => `${count} semanas`,
    weightToday: (kg: string) => `${kg} hoy`,
    weightA11y: (from: string, to: string, weeks: number) => `Tu peso pasó de ${from} a ${to} en ${weeks} semanas.`,
    /** `when` is a time ("14:00") or a meal ("Cena", "Desayuno de mañana"). */
    nextMeal: (when: string) => `Siguiente · ${when}`,
    tomorrow: (meal: string) => `${meal} de mañana`,
  },

  nav: {
    home: 'Inicio',
    meals: 'Comidas',
    shoppingList: 'Lista del súper',
    recipes: 'Recetas',
    progress: 'Progreso',
    ai: 'Pregúntale a la IA',
    aiShort: 'IA',
    profile: 'Perfil',
  },

  recipes: {
    all: 'Todas',
    searchPlaceholder: 'Buscar recetas',
    noMatches: 'Ninguna receta coincide con tu búsqueda.',
    /** Card meta: "10 min · 1 porción". */
    meta: (parts: string[]) => parts.join(' · '),
    mealTypes: { BREAKFAST: 'Desayuno', LUNCH: 'Comida', DINNER: 'Cena', SNACK: 'Colación' },
    empty: 'No hay recetas para esta comida todavía.',
    loadFailed: 'No pudimos cargar las recetas. Revisa tu conexión.',
    detailFailed: 'No pudimos cargar la receta. Revisa tu conexión.',
    retry: 'Reintentar',
    servings: (count: string) => `Rinde ${count}`,
    servingOne: 'porción',
    servingOther: 'porciones',
    ingredients: 'Ingredientes',
    steps: 'Preparación',
    perServing: 'Por porción',
    macros: (protein: string, carbs: string, fat: string) => `Proteína ${protein} · Carbohidratos ${carbs} · Grasa ${fat}`,
    nutritionUnavailable: 'La información nutricional no está disponible por ahora.',
    attribution: 'Información nutricional de FatSecret',
    /** [one, other]; abbreviations don't change. */
    units: {
      G: ['g', 'g'], ML: ['ml', 'ml'], PIECE: ['pieza', 'piezas'], CUP: ['taza', 'tazas'], TBSP: ['cda.', 'cdas.'], TSP: ['cdita.', 'cditas.'],
    },
  },

  meals: {
    title: 'Tu semana',
    /** Accessibility label of a day in the week strip. */
    dayA11y: (date: string, today: boolean) => (today ? `${date}, hoy` : date),
    /** The day ring: "99 %" of the target planned. */
    dayRingA11y: (percent: string) => `El plan del día cubre ${percent} de tu meta`,
    loadFailed: 'No pudimos cargar tu plan. Revisa tu conexión.',
    retry: 'Reintentar',
    today: 'Hoy',
    /** "1,820 de 1,850 kcal" */
    dayTotal: (planned: string, target: string) => `${planned} de ${target}`,
    totalsUnavailable: 'Los totales del día no están disponibles por ahora.',
    portion: (amount: string, unit: string) => `${amount} ${unit}`,
    noRecipe: 'Ninguna receta se ajusta a tu perfil para esta comida. Tu nutriólogo puede agregar más.',
    regenerate: 'Cambiar el menú de este día',
    regenerating: 'Buscando otras recetas…',
    regenerateFailed: 'No pudimos cambiar el menú. Inténtalo de nuevo.',
    /** Accessibility labels of the ♥ button. */
    favourite: (recipe: string) => `Marcar ${recipe} como favorita`,
    unfavourite: (recipe: string) => `Quitar ${recipe} de favoritas`,
    favouriteFailed: 'No pudimos guardar tu favorita. Inténtalo de nuevo.',
    consult: 'Tu plan de comidas estará listo cuando tu nutriólogo defina tu meta diaria.',
    mealFailed: 'No pudimos cargar esta comida. Revisa tu conexión.',
    yourPortion: 'Tu porción',
  },

  swaps: {
    sheetTitle: (food: string) => `Cambiar ${midSentence(food)}`,
    confirm: (food: string) => `Usar ${midSentence(food)}`,
    originalTag: (amount: string) => `${amount} · original`,
    hint: 'Puedes cambiar un ingrediente por otro del mismo grupo del SMAE. La cantidad se ajusta para que aporte lo mismo.',
    open: 'Cambiar',
    close: 'Cerrar',
    /** Accessibility label of the "Cambiar" button. */
    openLabel: (food: string) => `Cambiar ${food} por un equivalente`,
    insteadOf: (food: string) => `En lugar de ${food}`,
    /** "Cerveza · 100 g" */
    option: (food: string, amount: string) => `${food} · ${amount}`,
    undo: (food: string, amount: string) => `Volver a ${food} · ${amount}`,
    loading: 'Buscando equivalentes…',
    none: 'No hay equivalentes que puedas comer para este alimento.',
    optionsFailed: 'No pudimos cargar los equivalentes. Inténtalo de nuevo.',
    saveFailed: 'No pudimos cambiar el alimento. Inténtalo de nuevo.',
  },

  shoppingList: {
    intro: 'Todo lo que necesitas para las comidas de esta semana, ya con tus porciones y cambios.',
    /** "3 de 12 en el carrito" */
    progress: (checked: string, total: string) => `${checked} de ${total} en el carrito`,
    empty: 'Tu plan de esta semana todavía no tiene ingredientes.',
    loadFailed: 'No pudimos cargar tu lista. Revisa tu conexión.',
    retry: 'Reintentar',
    checkFailed: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
    consult: 'Tu lista estará lista cuando tu nutriólogo defina tu meta diaria.',
    sections: {
      PRODUCE: 'Frutas y verduras',
      MEAT_FISH: 'Carnes y pescados',
      DAIRY_EGGS: 'Lácteos y huevo',
      BAKERY: 'Panadería y tortillería',
      GROCERY: 'Abarrotes',
      NUTS_SEEDS: 'Semillas',
    },
  },

  profile: {
    facts: {
      height: 'Estatura',
      weight: 'Peso',
      birthDate: 'Nacimiento',
      activity: 'Actividad',
      activityLevels: { SEDENTARY: 'Sedentaria', LIGHT: 'Ligera', MODERATE: 'Moderada', ACTIVE: 'Alta', VERY_ACTIVE: 'Muy alta' },
      meals: 'Comidas al día',
      allergies: 'Alergias',
      none: 'Ninguna',
      dislikes: 'No te gusta',
      pregnant: 'Embarazo o lactancia',
      yes: 'Sí',
    },
    editLink: 'Editar',
    subscription: 'Suscripción',
    subscriptionInactive: 'Inactiva',
    support: (email: string) => `Soporte: ${email}`,
    open: 'Mi perfil',
    loadFailed: 'No pudimos cargar tu perfil. Revisa tu conexión.',
    retry: 'Reintentar',
    target: {
      title: 'Tu meta diaria',
      macros: (protein: string, carbs: string, fat: string) => `Proteína ${protein} · Carbohidratos ${carbs} · Grasa ${fat}`,
      note: 'Calculada con tus datos para mantener tu peso. Tu nutriólogo puede ajustarla.',
      hold: {
        MINOR: 'Por ser menor de edad, tu nutriólogo definirá tu meta diaria.',
        PREGNANT_OR_BREASTFEEDING: 'Durante el embarazo o la lactancia, tu nutriólogo definirá tu meta diaria.',
        UNDERWEIGHT: 'Con tu peso actual no recomendamos bajar de peso. Consulta a tu nutriólogo.',
        BELOW_FLOOR: 'Tu meta diaria necesita la revisión de tu nutriólogo.',
      },
    },
    data: {
      title: 'Tus datos',
      birthDate: (date: string) => `Fecha de nacimiento: ${date}`,
      heightWeight: (height: string, weight: string) => `Estatura ${height} · Peso ${weight}`,
      pregnant: 'Embarazo o lactancia',
      noAllergies: 'Sin alergias',
      allergies: (list: string) => `Alergias: ${list}`,
      dislikes: (list: string) => `No te gusta: ${list}`,
    },
    edit: 'Editar mis datos',
    save: 'Guardar cambios',
    saving: 'Guardando…',
    fixErrors: 'Revisa los datos marcados.',
    deleteAccount: 'Eliminar mi cuenta',
    deleting: 'Eliminando…',
    deleteConfirm: {
      title: '¿Eliminar tu cuenta?',
      body: (name: string) =>
        `Se borrarán tus datos de salud, tus planes y tu cuenta en la app de ${name}. No se puede deshacer. ` +
        'Si tienes una suscripción, cancélala con tu nutriólogo.',
      confirm: 'Eliminar',
      cancel: 'Cancelar',
    },
  },

  onboarding: {
    intro: 'Cuéntanos un poco sobre ti para preparar tu plan.',
    progress: (step: number, total: number) => `Paso ${step} de ${total}`,
    next: 'Siguiente',
    back: 'Atrás',
    finish: 'Terminar',
    saving: 'Guardando…',
    aboutYou: {
      title: 'Sobre ti',
      sex: 'Sexo',
      sexHint: 'Lo usamos para calcular tu gasto de energía.',
      female: 'Mujer',
      male: 'Hombre',
      pregnant: 'Estoy embarazada o en lactancia',
      birthDate: 'Fecha de nacimiento',
      day: 'Día',
      month: 'Mes',
      year: 'Año',
    },
    body: {
      title: 'Tus medidas',
      height: 'Estatura (cm)',
      heightPlaceholder: 'Ej. 165',
      weight: 'Peso actual (kg)',
      weightPlaceholder: 'Ej. 68.5',
    },
    activity: {
      title: '¿Cuál es tu nivel de actividad?',
      levels: {
        SEDENTARY: { label: 'Poca o nula actividad', hint: 'Trabajo de escritorio, casi sin ejercicio.' },
        LIGHT: { label: 'Actividad ligera', hint: 'Ejercicio ligero 1 a 3 días por semana.' },
        MODERATE: { label: 'Actividad moderada', hint: 'Ejercicio moderado 3 a 5 días por semana.' },
        ACTIVE: { label: 'Actividad alta', hint: 'Ejercicio intenso 6 a 7 días por semana.' },
        VERY_ACTIVE: { label: 'Actividad muy alta', hint: 'Trabajo físico pesado o entrenas dos veces al día.' },
      },
    },
    meals: {
      title: '¿Cuántas comidas haces al día?',
      hint: 'Contando colaciones.',
      option: (n: number) => `${n} comidas`,
    },
    allergies: {
      title: '¿Tienes alguna alergia?',
      hint: 'Marca todas las que apliquen. Si no tienes ninguna, continúa.',
      names: {
        gluten: 'Gluten (trigo, cebada, centeno)',
        crustaceans: 'Crustáceos (camarón, langosta)',
        eggs: 'Huevo',
        fish: 'Pescado',
        peanuts: 'Cacahuate',
        soy: 'Soya',
        milk: 'Leche',
        tree_nuts: 'Nueces (almendra, nuez, pistache)',
        sulfites: 'Sulfitos',
      },
    },
    dislikes: {
      title: '¿Hay alimentos que no te gusten?',
      hint: 'Los evitaremos en tu plan. Es opcional.',
      placeholder: 'Busca un alimento, ej. hígado',
      add: (food: string) => `Agregar ${food}`,
      remove: (food: string) => `Quitar ${food}`,
      noMatches: 'No encontramos ese alimento. Prueba con otra palabra.',
      full: 'Llegaste al máximo de alimentos. Quita alguno para agregar otro.',
      loading: 'Cargando alimentos',
      loadError: 'No pudimos cargar la lista de alimentos.',
      retry: 'Reintentar',
    },
    errors: {
      required: 'Este dato es obligatorio.',
      invalidDate: 'Revisa la fecha.',
      futureDate: 'La fecha no puede ser futura.',
      heightRange: 'Escribe tu estatura en centímetros, entre 100 y 250.',
      weightRange: 'Escribe tu peso en kilos, entre 25 y 350.',
    },
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
