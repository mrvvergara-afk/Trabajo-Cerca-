export const PRIMARY_PLACES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria'] as const;
export const COMPLEMENTARY_PLACES = ['Los Ángeles','Temuco','Concepción','Chillán'] as const;
export const WORK_PLACES:string[] = [...PRIMARY_PLACES,...COMPLEMENTARY_PLACES];
