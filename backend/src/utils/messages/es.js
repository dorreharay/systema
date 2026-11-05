// The texts the server sends in Spanish: the password reset email and the page behind its link (see en.js).
export default {
  email: {
    greeting: '¡Hola, {name}!',
    greetingAnonymous: '¡Hola!',
    instructionText: 'Para cambiar tu contraseña, abre el siguiente enlace:',
    instructionHtml: 'Para cambiar tu contraseña, toca el botón:',
    button: 'Cambiar contraseña',
    expiry: 'El enlace es válido durante {minutes} min. Si no has solicitado el cambio de contraseña, simplemente ignora este correo.',
    subject: 'Restablece tu contraseña de {appName}',
  },
  page: {
    opening: 'Abriendo {name}',
    explain: 'Se abrirá la aplicación para que puedas elegir una nueva contraseña.',
    open: 'Abrir {name}',
    hint: '¿No se abre? Comprueba que la aplicación {name} está instalada en este teléfono y toca el botón. Abre este enlace desde tu teléfono.',
    brokenTitle: 'Este enlace no funciona',
    broken: 'Ha caducado o ya se ha usado. Solicita uno nuevo en la aplicación: “¿Olvidaste tu contraseña?”',
  },
};
