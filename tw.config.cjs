/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./admin.html", "./js/*.js"],
  theme: {
    extend: {
      fontFamily: {
        fa: ["Vazirmatn", "Tahoma", "sans-serif"],
        cafe: ["Vazirmatn", "Tahoma", "sans-serif"],
      },
      colors: {
        cafe: {
          black: "#1c1612",
          darker: "#2a2018",
          dark: "#faf6f0",
          brown: "#e8ddd0",
          "brown-light": "#d4c4b0",
          gold: "#b8860b",
          "gold-light": "#d4a843",
          yellow: "#e8c547",
          cream: "#f0e9df",
          white: "#faf6f0",
          text: "#3d2e1f",
          "text-muted": "#7a6b5a",
        },
      },
    },
  },
};
