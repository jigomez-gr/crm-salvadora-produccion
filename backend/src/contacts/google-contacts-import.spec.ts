import { ContactsService } from './contacts.service';
import { Contact, ContactStatus } from '../common/entities/contact.entity';

describe('Google Contacts CSV Import & Discrepancies Report', () => {
  let service: ContactsService;
  let contactsRepoMock: any;
  let appointmentsRepoMock: any;
  let eventEmitterMock: any;
  let inMemoryContacts: Contact[] = [];

  const sampleGoogleCsv = `First Name,Middle Name,Last Name,Phonetic First Name,Phonetic Middle Name,Phonetic Last Name,Name Prefix,Name Suffix,Nickname,File As,Organization Name,Organization Title,Organization Department,Birthday,Notes,Photo,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,Phone 3 - Label,Phone 3 - Value,Phone 4 - Label,Phone 4 - Value
Abogado,,Abogado,,,,,,,,,,,,,,* myContacts,,,,,Mobile,919 93 34 03,,,,,,
Admpaseoflorida,,Admpaseoflorifa,,,,,,,,,,,,,,* myContacts,,,,,Mobile,645 80 78 02,Work,645 80 78 02,,,,
Alejandro,,Velasco Gonzalez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 607 64 09 06,,,,,,
ANDONI PEREZ,DE,LEMA,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 661 73 94 73,,,,,,
Ángel ,,Ferreteria,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 660 80 74 51,,,,,,
Angela,Muñoz,Madero,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 687 93 91 93,,,,,,
Anita,,Collado Gomez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+41 78 965 70 09,,,,,,
Antonia,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 663 06 22 32,,,,,,
Antonio,,Gómez Morales,,,,,,,,Sap,,,,,,* myContacts,* Home,agomezmorales@hotmail.com,Home,agomezmorales@gmail.com,Mobile,+34 677 63 94 29,,,,,,
Antonio Hijo De Jesús Parquet,,Parquet,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 621 14 86 29,,,,,,
Apple,,Applr,,,,,,,,,,,,,,* myContacts,,,,,Mobile,900 812 703,,,,,,
Arancha,,Arancha,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 664 68 56 57,,,,,,
Asgult,,Asgult,,,,,,,,Igae,,,,,,* myContacts,,,,,Mobile,628 01 12 00,Main,628 01 20 00,,,,
At,,Cliente,,,,,,,,,,,,,,* myContacts,,,,,Home,1004,,,,,,
Aurelio Rodriguez | Asociacion 'Informatica Abierta',,,,,,,,,,Aurelio Rodriguez | Asociacion 'Informatica Abierta',,,,,,* myContacts,,,,,Mobile,+34 661 00 51 28,,,,,,
Bapi Prueba,,Salvafora,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+442045775777,,,,,,
Belen,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,605 56 91 38,,,,,,
Benito,,Caro,,,,,,,,Igar,,,,,,* myContacts,,,,,Mobile,609 60 28 43,,,,,,
Buzon,,Movistar,,,,,,,,,,,,,,* myContacts,,,,,Home,22500,,,,,,
Cabello,,Carro,,,,,,,,,,,,,,* myContacts,,,,,Work,+34649453996,,,,,,
Carlos,,Baez,,,,,,,,Agn,,,,,,* myContacts,* Home,cbaez@asetesa.com,,,Mobile,626 17 58 50,Work,915 31 28 23,Móvil,+34 626 17 58 50,Trabajo,+34 915 31 28 23
Carlos,,Capell,,,,,,,,Neoknow,,,,,,* myContacts,* Home,ccapell@neoknow.es,,,Mobile,679 73 87 08,,,,,,
Carlos,,García Palomar,,,,,,,,Telefonica,,,,,,* myContacts,,,,,Mobile,619 30 10 46,,,,,,
Carlos,,Tejero,,,,,,,,,,,,,,* myContacts,,,,,Mobile,4432,,,,,,
Carlos,,Vecino Segundo I,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34645951565,,,,,,
Carmen 💗,,Isidro,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34691152829,,,,,,
Carmen,,Sotoca,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34630036197,,,,,,
Centro de Rehabilitación Fundación Jiménez Díaz,Jiménez,Díaz,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34915504876,,,,,,
CL,,Gonzalez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34605799693,,,,,,
Consuelo Gómez,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34662483081,,,,,,
ConsultConsumo,,,,,,,,,,,,,,,,* myContacts,,,,,Home,2266,,,,,,
Dany,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34627451900,,,,,,
Dentista,,Dentista,,,,,,,,Dentista,,,,,,* myContacts,,,,,Mobile,915 54 11 70,,,,,,
Dr Arriets,,Arrieta Jiménez Disx,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34915497773,,,,,,
Eduardo,,Rodríguez Vaxquez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34651849338,,,,,,
Emilio,Gómez,Morales,,,,,,,,,,,,,https://lh3.googleusercontent.com/contacts/AG6tpzFc9mN7vgK7DnU0QDJdGEC27A6vUFvuhk-EiQpxmItC4WqueEs6,* myContacts,* Otro,egomezmorales@gmail.com,,,Móvil,+1 787-980-7754,,,,,,
Emilio,,Gómez Morales,,,,,,,,,,,,,,* myContacts,,,,,Mobile,(787) 602-1159,Home,(787) 980-7754,,,,
Enrique,,Del Sol,,,,,,,,Telefonica,,,,,,* myContacts,* Home,e.delsol@gmail.com,,,Mobile,629 22 81 22,,,,,,
Escritos.Gp@telefonica.com,,Escritos,,,,,,,,Telefónica,,,,,,* myContacts,,,,,Mobile,+34 638 10 10 04,,,,,,
Fernando,,Villamariin,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 609 07 59 56,,,,,,
GuardiaNET,,,,,,,,,,GuardiaNET,,,,,,* myContacts,,,,,Mobile,+34 667 11 03 00,,,,,,
Hospital Reina Sofia,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34630306705144800,,,,,,
Iberdr,,Iberdrola,,,,,,,,,,,,,,* myContacts,,,,,Mobile,IBERDROLA,,,,,,
Inf,,11822,,,,,,,,,,,,,,* myContacts,,,,,Home,11822,,,,,,
Isidro,,Portero,,,,,,,,,,,,,,* myContacts,,,,,Otro,+34 616 56 03 11,,,,,,
Jak,,Alonso Navales,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 649 41 50 07,,,,,,
Javier,,Teba,,,,,,,,Fujitsu,,,,,,* myContacts,,,,,Mobile,649 52 81 02,,,,,,
Jesus,,Electricista,,,,,,,,,,,,,,* myContacts,,,,,Mobile,663 79 83 35,,,,,,
JesusVicioso,,,,,,,,,,,,,,,,* myContacts,,,,,Móvil,+34 663 79 83 35,,,,,,
Jiaplle,,Jiaolle,,,,,,,,,,,,,,* myContacts,,,,,Mobile,648 94 71 15,,,,,,
Jigretra,,Jigretera,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34650039834,,,,,,
Joaquin,,García Cortés ,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 619 20 09 51,,,,,,
José Antonio,,Aguilar Credpo,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34692564723,,,,,,
José ,,Cabello,,,,,,,,,,,,,,* myContacts,,,,,,,,,,,,
Jose,,Cabwkki,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+55 61 94014-749,,,,,,
Jose,,González Salvador,,,,,,,,,,,,,,* myContacts,,,,,Mobile,650 29 22 69,,,,,,
José Ignacio,,Gómez Raya ,,,,,,,,Nonr,,,,,,* myContacts,,,,,Mobile,649 45 39 96,,,,,,
José Ignacio,,Gómez Raya Matinez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34681138342,,,,,,
José Ignacio,,Gómez Rubio,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 672 58 02 87,,,,,,
Josecabello,,Cabello,,,,,,,,,,,,,,* myContacts,,,,,Mobile,686 73 57 48,,,,,,
Joselu,,Urbano,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 660 38 63 55,,,,,,
Juanho,,Baraona,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 618 04 54 35,,,,,,
Juanjo,,Cha,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 654 10 24 33,,,,,,
Karate,,Karate,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 644 21 17 46,,,,,,
Lilian,,Morales,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+1 787-617-9091,,,,,,
Lol,,Bermudez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 680 52 69 58,,,,,,
Lola,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34609123329,,,,,,
Luis,,García Nuñez,,,,,,,,Ricoh,,,,,,* myContacts,,,,,Mobile,677 85 41 74,,,,,,
Luis,Gomez,Raya,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 668 83 76 04,,,,,,
Magaly,,Morales,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34676498720,,,,,,
Manuel,,Alfaro,,,,,,,,Igae,,,,,,* myContacts,,,,,Mobile,686 66 15 44,,,,,,
Manuel Seco,,Seco,,,,,,,,,,,,,,* myContacts,,,,,Mobile,628 28 98 90,,,,,,
Manuela Brändle,,Brandle,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34629405237,,,,,,
María,Jesús,Casado,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 659 41 33 87,,,,,,
María ,,Malmierca,,,,,,,,Abogada,,,,,,* myContacts,,,,,Mobile,+34637535368,,,,,,
Mariano,Porta,Lansac,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 649 47 78 16,,,,,,
Marisela,,,,,,,,,,,,,,,,* myContacts,,,,,Móvil,+34 608 09 69 51,,,,,,
Maritza,,Rodriguez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34603170104,,,,,,
Matilde,,Matilde,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34680484670,,,,,,
Motos,,Elvira,,,,,,,,,,,,,,* myContacts,,,,,Mobile,915 42 58 52,,,,,,
Nacho,,,,,,,,,,,,,,,,* myContacts,,,,,Telemóvel,+34 660 13 48 58,,,,,,
No S ,,Tejero,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 638 95 08 42,,,,,,
Noticias,,,,,,,,,,,,,,,,* myContacts,,,,,Home,22303,,,,,,
Olga Vila,,Vila,,,,,,,,Igdi,,,,,,* myContacts,* Home,olga.vila@igdi.es,,,Mobile,607 92 13 47,,,,,,
Paco,,Glez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 686 29 34 01,,,,,,
Parquet Jesus,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 629 26 18 77,,,,,,
Pcmadrid,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,PCMADRID,,,,,,
Pedro,Ceballos,Emaús,,,,,,,,,,,,,,* myContacts,,,,,Móvil,+34 650 01 85 18,,,,,,
Pedro,,García Repetto,,,,,,,,Igae,,,,,,* myContacts,* Home,prepetto@igae.hacienda.gob.es,,,Mobile,+34 629 64 12 94,,,,,,
Peke,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 610 53 78 94,,,,,,
Portero Paseo Florida,,Paseo Florida Portero,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 630 07 98 80,,,,,,
ProgramaPuntos,,,,,,,,,,,,,,,,* myContacts,,,,,Home,2236,,,,,,
Puertas,Lacass,,,,,Puertas Lacasa,,,,Lacasa,,,,,,* myContacts,,,,,Mobile,605 79 88 84,Work,605 79 88 84,,,,
Recarga,,Saldo,,,,,,,,,,,,,,* myContacts,,,,,Home,2200,,,,,,
Rlvlopez,,Lopez,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 696 47 07 97,,,,,,
Roberto,,Gonzalez,,,,,,,,Ricoh,,,,,,* myContacts,,,,,Mobile,658 17 37 51,Work,663 26 04 80,,,,
Roberto,,González Valdepeñas,,,,,,,,Ricoh,,,,,,* myContacts,,,,,Mobile,663 26 04 80,,,,,,
Rosa,,Capell,,,,,,,,,,,2011-03-02,,https://lh3.googleusercontent.com/contacts/AG6tpzGtHPsFhDNl-h1tNqnnwC3Dd3HlSF0s2IiXTyXBJI9q8iTFhA4X,* myContacts,* INTERNET,rosa.capell@ts.fujitsu.com,,,Móvil,+34 616 98 49 65,,,,,,
Rrcurr,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,660 08 93 58,,,,,,
Ruben,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 639 93 35 30,,,,,,
Ruben,,Rubén Movil,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 629 11 64 72,,,,,,
Ruperez,,Ruperrz,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34 696 69 47 28,,,,,,
salvadora,,conesa,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34695172625,,,,,,
Salvadora,,Escuela De Yoga,,,,,,,,,,,,,,* myContacts,,,,,Mobile,+34683781830,,,,,,
Tapizados Cordoba,,Tapizados Cordoba,,,,,,,,Tapizados Cordoba,,,,,,* myContacts,,,,,Mobile,+34 696 91 33 67,,,,,,
Tesm Sale,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,Teamsale,,,,,,
Urbano,,Urbano,,,,,,,,Stos,,,,,,* myContacts,,,,,Mobile,615 79 57 37,,,,,,
Vecinosrribacarlos,,Carlos Vecino,,,,,,,,Vecinosrribs,,,,,,* myContacts,* Home,none,,,Mobile,645 95 15 65,,,,,,
Whuse,,,,,,,,,,,,,,,,* myContacts,,,,,Mobile,Wise,,,,,,
Yavoy,,,,,,,,,,,,,,,,* myContacts,,,,,Home,2210,,,,,,
Zeletis,,Zelerod,,,,,,,,,,,,,,* myContacts,,,,,Mobile,ZELERIS,,,,,,`;

  beforeEach(() => {
    inMemoryContacts = [
      {
        id: 'crm-salvadora-1',
        name: 'Salvadora Conesa Martinez',
        phone: '+34695172625',
        email: 'salvadora@centroyoga.com',
        notes: 'Directora',
        status: ContactStatus.ACTIVE,
        tags: ['profesor'],
      } as Contact,
    ];

    contactsRepoMock = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        if (where.phone) {
          return Promise.resolve(inMemoryContacts.find((c) => c.phone === where.phone) || null);
        }
        if (where.id) {
          return Promise.resolve(inMemoryContacts.find((c) => c.id === where.id) || null);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation((dto) => {
        return {
          id: `c-${Date.now()}-${Math.random()}`,
          ...dto,
        };
      }),
      save: jest.fn().mockImplementation((contact) => {
        const idx = inMemoryContacts.findIndex((c) => c.phone === contact.phone);
        if (idx >= 0) {
          inMemoryContacts[idx] = { ...inMemoryContacts[idx], ...contact };
          return Promise.resolve(inMemoryContacts[idx]);
        }
        inMemoryContacts.push(contact);
        return Promise.resolve(contact);
      }),
      query: jest.fn().mockResolvedValue([]),
    };

    appointmentsRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    service = new ContactsService(
      contactsRepoMock as any,
      appointmentsRepoMock as any,
      eventEmitterMock as any,
    );
  });

  it('imports Google Contacts CSV, detects existing contacts, omitted rows, and generates complete reports', async () => {
    const result = await service.importGoogleCsv({
      csvContent: sampleGoogleCsv,
      openNotepad: false,
    });

    expect(result.total).toBe(111);
    expect(result.existing).toBe(4); // Salvadora Conesa (seeded) + 3 duplicate phone rows within CSV
    expect(result.created).toBe(91); // 95 valid phone candidates minus 4 existing/duplicate
    expect(result.skipped).toBe(16); // 16 omitted (1 without any info, 5 text phones, 9 short codes, 1 17-digit)

    // Check specific omissions
    expect(result.reportText).toContain('IBERDROLA');
    expect(result.reportText).toContain('PCMADRID');
    expect(result.reportText).toContain('Teamsale');
    expect(result.reportText).toContain('Wise');
    expect(result.reportText).toContain('ZELERIS');
    expect(result.reportText).toContain('1004');
    expect(result.reportText).toContain('22500');
    expect(result.reportText).toContain('4432');
    expect(result.reportText).toContain('2266');
    expect(result.reportText).toContain('11822');
    expect(result.reportText).toContain('José Cabello');

    // Check contacts without email
    expect(result.contactsWithoutEmailCount).toBeGreaterThan(0);
    expect(result.reportText).toContain('INFORME DE CONTACTOS SIN CORREO ELECTRÓNICO');

    // Check contacts without phone
    expect(result.contactsWithoutPhoneCount).toBe(16);
    expect(result.reportText).toContain('INFORME DE CONTACTOS SIN MÓVIL / TELÉFONO VÁLIDO');

    // Check duplicate/shared phones
    expect(result.reportText).toContain('TELÉFONOS COMPARTIDOS O DUPLICADOS');
    expect(result.reportText).toContain('+34649453996'); // Cabello Carro & José Ignacio Gómez Raya
    expect(result.reportText).toContain('+34645951565'); // Carlos Vecino Segundo I & Vecinosrribacarlos Carlos Vecino
    expect(result.reportText).toContain('+34663798335'); // Jesus Electricista & JesusVicioso
    expect(result.reportText).toContain('+34663260480'); // Roberto Gonzalez & Roberto González Valdepeñas

    // Check similar names
    expect(result.reportText).toContain('NOMBRES SIMILARES O POSIBLES PERSONAS DUPLICADAS');
    expect(result.reportText).toContain('Emilio Gómez Morales');
    expect(result.reportText).toContain('José Ignacio Gómez Raya');

    // Check that existing contact Salvadora Conesa was preserved and not duplicated
    expect(result.reportText).toContain('Coincidencia en CRM: Salvadora Conesa Martinez');
  });

  it('rejects empty CSV with BadRequestException', async () => {
    await expect(
      service.importGoogleCsv({
        csvContent: '',
        openNotepad: false,
      }),
    ).rejects.toThrow('Debes indicar la ruta del archivo CSV de Google');
  });
});
