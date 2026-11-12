export interface ConstelacionesItem {
  nombre: string;
  movil: string;
  email: string;
  dia?: string;
  hora?: string;
  observaciones: string;
}

export const CONSTELACIONES_RAW = `Ainhoa Marabel#615997034#cargainicial###Constelaciones
Angeles#687929267#cargainicial###Constelaciones
Bea curso#606799666#cargainicial###Constelaciones; Contacto original menciona curso
Carmen de Alicante#645197768#cargainicial###Constelaciones
Carmen de Juani#676852287#cargainicial###Constelaciones
Ckun#691054589#cargainicial###Constelaciones
Concesionario Plaza Castilla#674231117#cargainicial###Constelaciones; REVISAR: parece un contacto comercial, no consta relación con constelaciones
Consuelo#651485356#cargainicial###Constelaciones
Cristopher#626524924#cargainicial###Constelaciones
Diana Raton#619021373#cargainicial###Constelaciones
Esmeralda#663944937#cargainicial###Constelaciones; Contacto original menciona curso
Fabio#637431932#cargainicial###Constelaciones; Contacto original menciona curso
Fernanda ricorivero#660672155#cargainicial###Constelaciones
Francisca#605873135#cargainicial###Constelaciones
Irene Amor#624229475#cargainicial###Constelaciones
Josele#600013954#cargainicial###Constelaciones
Libertad#615335432#cargainicial###Constelaciones
Lola Mangas#627554987#cargainicial###Constelaciones; Contacto original menciona curso
Macarena#685340277#cargainicial###Constelaciones
Nieves#634522279#cargainicial###Constelaciones
Nuria Saúl#650786232#cargainicial###Constelaciones; Confirmar nombre
Paloma#607568701#cargainicial###Constelaciones
Paloma curso#629274370#cargainicial###Constelaciones; Contacto original menciona curso
Raquel Leganés#629016356#cargainicial###Constelaciones; Confirmar nombre
Sonia Matilda#615935751#cargainicial###Constelaciones`;

export function parseConstelaciones(): ConstelacionesItem[] {
  return CONSTELACIONES_RAW.trim()
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
