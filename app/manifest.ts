import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'الحوت — إدارة الأقساط',
    short_name: 'الحوت',
    description: 'إدارة العقود والأقساط والتحصيل',
    start_url: '/',
    display: 'standalone',
    background_color: '#071a2e',
    theme_color: '#071a2e',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: '/icons/whale.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/whale-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}

