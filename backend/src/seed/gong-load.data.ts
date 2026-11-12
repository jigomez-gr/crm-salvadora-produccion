export interface GongItem {
  nombre: string;
  movil: string;
  email: string;
  dia?: string;
  hora?: string;
  observaciones: string;
}

export const GONG_RAW = `Anita#629578201#cargainicial###Gong
Ángela GFU#677451759#cargainicial###Gong; Confirmar nombre
Caroline#601250097#cargainicial###Gong; Nombre original: GongCaroline 🌻
Conchi#627809579#cargainicial###Gong
Cris#649425091#cargainicial###Gong
Esther runner#629813323#cargainicial###Gong; Confirmar nombre
Helen de Fran#654820929#cargainicial###Gong; Nombre original: Gonhelendefran
Luisa Valladares#619706357#cargainicial###Gong
Mari Carmen#613097368#cargainicial###Gong; Nombre original: Gongmaricarmen 💫
Maribel#620223978#cargainicial###Gong; Nombre original: GongMaribel🦋
María#680932282#cargainicial###Gong; Nombre original: Goglemaria; confirmar pertenencia a Gong
Noe#699900518#cargainicial###Gong
Raquel Wonder#650377070#cargainicial###Gong; Nombre original: Gongraquel Wonder👠🐯
Rocío de Txiki#637519933#cargainicial###Gong; Confirmar nombre
Sandra & Jaineba Naphiri#610309935#cargainicial###Gong; Contacto compartido; confirmar titulares
Sara#681205498#cargainicial###Gong
Silvia#606680392#cargainicial###Gong`;

export function parseGong(): GongItem[] {
  return GONG_RAW.trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split('#').map((p) => p.trim());
      return {
        nombre: parts[0] || '',
        movil: parts[1] || '',
        email: parts[2] || 'cargainicial',
        dia: parts[3] || undefined,
        hora: parts[4] || undefined,
        observaciones: parts[5] || '',
      };
    });
}
