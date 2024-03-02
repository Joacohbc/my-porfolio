/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		fontFamily: {
			mono: [ 'Noto Sans','monospace' ],
			serif: ['Anta', 'serif'],
		},
		extend: {
			colors: {
				lightblack: '#131313',
			}
		},
	},
	plugins: [ require('tailwindcss-animated') ],
}
