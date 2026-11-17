import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const OUT = path.resolve("public/books");
fs.mkdirSync(OUT, { recursive: true });

const W = 432;
const H = 576;
const M = 56;
const INK = "#26221d";
const MUTED = "#8b8174";
const RULE = "#d8cdba";
const PAPER = "#fbf7ee";

const ease = (t) => t;

class Book {
  constructor(meta) {
    this.meta = meta;
    this.doc = new PDFDocument({
      autoFirstPage: false,
      size: [W, H],
      margins: 0,
      info: {
        Title: meta.title,
        Author: meta.author,
        Creator: "Lecty",
        Producer: "Lecty Editorial",
      },
    });
    this.pages = 0;
    this.y = 80;
  }

  addPage(bg = PAPER) {
    this.doc.addPage({ size: [W, H], margins: 0 });
    this.pages += 1;
    this.doc.rect(0, 0, W, H).fill(bg);
    this.y = 80;
    return this.doc;
  }

  cover({ bg, ink, accent, kicker, title, author, imprint, motif = "arcs" }) {
    const d = this.doc;
    this.addPage(bg);

    // Subtle texture of dots
    d.save().fillOpacity(0.05).fillColor(ink);
    for (let yy = 40; yy < H - 40; yy += 14) {
      for (let xx = 40; xx < W - 40; xx += 14) {
        d.circle(xx, yy, 0.7).fill();
      }
    }
    d.restore();

    if (motif === "arcs") {
      d.save().lineWidth(0.7).strokeColor(accent).strokeOpacity(0.55);
      for (let r = 46; r <= 150; r += 26) {
        d.circle(W - 74, H - 118, r).stroke();
      }
      d.restore();
    } else if (motif === "lines") {
      d.save().lineWidth(1).strokeColor(accent).strokeOpacity(0.4);
      for (let i = 0; i < 9; i += 1) {
        const y = 402 + i * 12;
        d.moveTo(M, y).lineTo(W - 74, y).stroke();
      }
      d.restore();
    } else {
      d.save().fillColor(accent).fillOpacity(0.16);
      d.circle(W - 92, 132, 66).fill();
      d.restore();
    }

    d.rect(22, 22, W - 44, H - 44).lineWidth(0.8).strokeColor(accent).strokeOpacity(0.7).stroke();

    d.fillOpacity(1).font("Times-Roman").fontSize(7.5).fillColor(accent);
    d.text(kicker.toUpperCase(), M + 16, 78, {
      width: W - 2 * M - 32,
      align: "center",
      characterSpacing: 2.4,
    });

    const titleSize = title.length > 22 ? 31 : 37;
    d.font("Times-Bold").fontSize(titleSize).fillColor(ink);
    d.text(title, M + 12, 232, {
      width: W - 2 * M - 24,
      align: "center",
      lineGap: 2,
      lineBreak: true,
    });

    d.save().lineWidth(0.6).strokeColor(accent).strokeOpacity(0.8);
    d.moveTo(W / 2 - 22, 348).lineTo(W / 2 + 22, 348).stroke();
    d.restore();

    d.font("Times-Italic").fontSize(12.5).fillColor(ink).fillOpacity(0.85);
    d.text(author, M + 24, 370, { width: W - 2 * M - 48, align: "center" });

    d.fillOpacity(1).font("Helvetica").fontSize(6.5).fillColor(accent);
    d.text(imprint.toUpperCase(), M, H - 66, {
      width: W - 2 * M,
      align: "center",
      characterSpacing: 2,
    });

    // Return to a normal page state
    d.fillOpacity(1).strokeOpacity(1);
    return this;
  }

  interiorHeader() {
    const d = this.doc;
    d.font("Times-Italic").fontSize(7.5).fillColor(MUTED);
    d.text(this.meta.title, M, 32, { width: W - 2 * M, align: "center" });
    d.moveTo(M, 45).lineTo(W - M, 45).lineWidth(0.4).strokeColor(RULE).stroke();
    d.font("Times-Roman").fontSize(8).fillColor(MUTED);
    d.text(String(this.pages), M, H - 33, { width: W - 2 * M, align: "center" });
  }

  contentPage() {
    this.addPage(PAPER);
    this.interiorHeader();
    this.y = 78;
    return this;
  }

  chapterOpener(kicker, title, standfirst) {
    this.contentPage();
    this.doc.outline.addItem(title);
    const d = this.doc;
    d.save().lineWidth(0.8).strokeColor("#b08d57");
    d.moveTo(M, 108).lineTo(M + 40, 108).stroke();
    d.restore();
    d.font("Helvetica").fontSize(7.5).fillColor("#9c7a45").text(kicker.toUpperCase(), M, 122, {
      width: W - 2 * M,
      characterSpacing: 2,
    });
    d.font("Times-Bold").fontSize(26).fillColor(INK).text(title, M, 146, {
      width: W - 2 * M,
      lineGap: 2,
    });
    let y = d.y + 16;
    if (standfirst) {
      d.font("Times-Italic").fontSize(11.5).fillColor("#5f574c").text(standfirst, M, y, {
        width: W - 2 * M - 10,
        lineGap: 4,
      });
      y = d.y + 22;
    }
    this.y = y;
  }

  paragraph(text, opts = {}) {
    const d = this.doc;
    const width = opts.width ?? W - 2 * M;
    const size = opts.size ?? 10.5;
    const font = opts.font ?? "Times-Roman";
    const align = opts.align ?? "justify";
    const gap = opts.gap ?? 10;
    const lineGap = opts.lineGap ?? 4.5;
    d.font(font).fontSize(size);
    const options = { width, align, lineGap };
    const h = d.heightOfString(text, options);
    if (this.y + h > H - 64) {
      this.contentPage();
    }
    const x = opts.indent ? M + opts.indent : M;
    d.fillColor(opts.color ?? INK).text(text, x, this.y, options);
    this.y += h + gap;
  }

  quote(text, source) {
    const d = this.doc;
    const width = W - 2 * M - 34;
    d.font("Times-Italic").fontSize(11);
    const h = d.heightOfString(text, { width, lineGap: 4 });
    if (this.y + h + 34 > H - 64) this.contentPage();
    d.save().lineWidth(1).strokeColor("#b08d57");
    d.moveTo(M, this.y + 2).lineTo(M, this.y + h + 2).stroke();
    d.restore();
    d.fillColor("#5f574c").text(text, M + 18, this.y, { width, lineGap: 4 });
    this.y += h + 8;
    if (source) {
      d.font("Helvetica").fontSize(7).fillColor(MUTED).text(source.toUpperCase(), M + 18, this.y, {
        width,
        characterSpacing: 1.4,
      });
      this.y = d.y + 18;
    } else {
      this.y += 18;
    }
  }

  tip(title, text) {
    const d = this.doc;
    const width = W - 2 * M;
    d.font("Times-Roman").fontSize(9.5);
    const bodyHeight = d.heightOfString(text, { width: width - 28, lineGap: 3.5 });
    const boxHeight = bodyHeight + 48;
    if (this.y + boxHeight > H - 64) this.contentPage();
    d.save().roundedRect(M, this.y, width, boxHeight, 3).fill("#f1e9da");
    d.restore();
    d.font("Helvetica-Bold").fontSize(7.5).fillColor("#8a6428").text(title.toUpperCase(), M + 14, this.y + 12, {
      width: width - 28,
      characterSpacing: 1.2,
    });
    d.font("Times-Roman").fontSize(9.5).fillColor("#4b443a").text(text, M + 14, this.y + 27, {
      width: width - 28,
      lineGap: 3.5,
    });
    this.y += boxHeight + 16;
  }

  sectionTitle(text, kicker) {
    const d = this.doc;
    if (this.y > H - 180) this.contentPage();
    if (kicker) {
      d.font("Helvetica").fontSize(7).fillColor("#9c7a45").text(kicker.toUpperCase(), M, this.y, {
        width: W - 2 * M,
        characterSpacing: 1.6,
      });
      this.y = d.y + 6;
    }
    d.font("Helvetica-Bold").fontSize(13.5).fillColor(INK).text(text, M, this.y, { width: W - 2 * M });
    this.y = d.y + 12;
  }

  bullet(text) {
    const d = this.doc;
    d.font("Times-Roman").fontSize(10);
    const width = W - 2 * M - 14;
    const h = d.heightOfString(text, { width, lineGap: 4 });
    if (this.y + h > H - 64) this.contentPage();
    d.circle(M + 2.5, this.y + 5.5, 1.5).fill("#b08d57");
    d.fillColor(INK).text(text, M + 14, this.y, { width, lineGap: 4 });
    this.y += h + 6;
  }

  poem(index, lines) {
    this.contentPage();
    this.doc.outline.addItem(`Rima ${index}`);
    const d = this.doc;
    d.font("Helvetica").fontSize(7.5).fillColor("#9c7a45").text(`RIMA ${index}`, M, 96, {
      width: W - 2 * M,
      characterSpacing: 2,
    });
    d.moveTo(M, 112).lineTo(M + 28, 112).lineWidth(0.8).strokeColor("#b08d57").stroke();

    const startY = 142;
    const bottom = H - 82;
    const available = bottom - startY;
    let size = 12;
    let gap = 7;
    let height = () =>
      lines.reduce((acc, line) => acc + (line ? size * 1.18 + gap : 10), 0);
    while (height() > available && size > 8.5) {
      size -= 0.5;
      gap = Math.max(3, gap - 0.4);
    }

    let y = startY;
    d.font("Times-Italic").fontSize(size).fillColor(INK);
    for (const line of lines) {
      if (!line) {
        y += 10;
        continue;
      }
      d.text(line, M + 18, y, { width: W - 2 * M - 36, lineGap: gap });
      y = d.y + 2;
    }
    d.font("Times-Roman").fontSize(8).fillColor(MUTED).text("G. A. Bécquer", M, H - 72, {
      width: W - 2 * M,
      align: "center",
    });
  }

  finish(file) {
    const d = this.doc;
    d.end();
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(path.join(OUT, file));
      d.pipe(stream);
      stream.on("finish", () => resolve({ file, pages: this.pages }));
      stream.on("error", reject);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Don Quijote                                                         */
/* ------------------------------------------------------------------ */

const quijote = new Book({
  title: "Don Quijote de la Mancha",
  author: "Miguel de Cervantes",
});

quijote
  .cover({
    bg: "#5c1f1c",
    ink: "#f6e7cd",
    accent: "#d9b06a",
    kicker: "Biblioteca de clásicos",
    title: "Don Quijote de la Mancha",
    author: "Miguel de Cervantes",
    imprint: "Lecty · Edición de lectura",
    motif: "arcs",
  });

quijote.contentPage();
quijote.doc.outline.addItem("Nota de la edición");
quijote.y = 176;
quijote.paragraph("NOTA DE LA EDICIÓN", {
  font: "Helvetica-Bold",
  size: 10,
  align: "left",
  color: "#9c7a45",
  gap: 18,
});
quijote.paragraph(
  "Esta edición digital reproduce el capítulo primero de la primera parte de El ingenioso hidalgo don Quijote de la Mancha, publicado por Miguel de Cervantes en 1605. El texto pertenece al dominio público.",
  { font: "Times-Roman", size: 10.5, lineGap: 5 }
);
quijote.paragraph(
  "Se ha respetado la puntuación y el vocabulario originales. Las páginas se han compuesto en una caja de lectura amplia, con tipos serif y márgenes generosos, para que el paso de hoja resulte cómodo en pantalla.",
  { font: "Times-Roman", size: 10.5, lineGap: 5 }
);
quijote.y += 10;
quijote.quote(
  "«En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor».",
  "Capítulo primero"
);

quijote.chapterOpener(
  "Primera parte · 1605",
  "Que trata de la condición y ejercicio del famoso hidalgo",
  "Capítulo primero"
);

const quijoteText = [
  "En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor. Una olla de algo más vaca que carnero, salpicón las más noches, duelos y quebrantos los sábados, lentejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda. El resto della concluían sayo de velarte, calzas de velludo para las fiestas con sus pantuflos de lo mismo, y los días de entre semana se honraba con su vellorí de lo más fino. Tenía en su casa una ama que pasaba de los cuarenta, y una sobrina que no llegaba a los veinte, y un mozo de campo y plaza, que así ensillaba el rocín como tomaba la podadera. Frisaba la edad de nuestro hidalgo con los cincuenta años; era de complexión recia, seco de carnes, enjuto de rostro, gran madrugador y amigo de la caza.",
  "Es, pues, de saber que este sobredicho hidalgo, los ratos que estaba ocioso —que eran los más del año—, se daba a leer libros de caballerías, con tanta afición y gusto, que olvidó casi de todo punto el ejercicio de la caza y aun la administración de su hacienda. Y llegó a tanto su curiosidad y desatino en esto, que vendió muchas hanegas de tierra de sembradura para comprar libros de caballerías en que leer, y así, llevó a su casa todos cuantos pudo haber dellos; y de todos, ningunos le parecían tan bien como los que compuso el famoso Feliciano de Silva, porque la claridad de su prosa y aquellas enturadas razones suyas le parecían de perlas.",
  "Con estas razones perdía el pobre caballero el juicio, y desvelábase por entenderlas y desentrañarles el sentido, que no se lo sacara ni las entendiera el mesmo Aristóteles, si resucitara para sólo ello. No estaba muy bien con las heridas que don Belianís daba y recebía, porque se imaginaba que, por grandes maestros que le hubiesen curado, no dejaría de tener el rostro y todo el cuerpo lleno de cicatrices y señales. Pero, con todo, alababa en su autor aquel acabar su libro con la promesa de aquella inacabable aventura, y muchas veces le vino deseo de tomar la pluma y dalle fin al pie de la letra, como allí se promete.",
  "Tuvo muchas veces competencia con el cura de su lugar —que era hombre docto, graduado en Sigüenza—, sobre cuál había sido mejor caballero: Palmerín de Ingalaterra o Amadís de Gaula; mas maese Nicolás, barbero del mesmo pueblo, decía que ninguno llegaba al Caballero del Febo, y que si alguno se le podía comparar, era don Galaor, hermano de Amadís de Gaula, porque tenía muy acomodada condición para todo; que no era caballero melindroso, ni tan llorón como su hermano, y que en lo de la valentía no le iba en zaga.",
  "En resolución, él se enfrascó tanto en su lectura, que se le pasaban las noches leyendo de claro en claro, y los días de turbio en turbio; y así, del poco dormir y del mucho leer, se le secó el celebro de manera que vino a perder el juicio. Llenósele la fantasía de todo aquello que leía en los libros, así de encantamentos como de pendencias, batallas, desafíos, heridas, requiebros, amores, tormentas y disparates imposibles; y asentósele de tal modo en la imaginación que era verdad toda aquella máquina de aquellas soñadas invenciones que leía, que para él no había otra historia más cierta en el mundo.",
  "En efeto, rematado ya su juicio, vino a dar en el más estraño pensamiento que jamás dio loco en el mundo, y fue que le pareció convenible y necesario, así para el aumento de su honra como para el servicio de su república, hacerse caballero andante e irse por todo el mundo con sus armas y caballo a buscar las aventuras y a ejercitarse en todo aquello que él había leído que los caballeros andantes se ejercitaban, deshaciendo todo género de agravio y poniéndose en ocasiones y peligros donde, acabándolos, cobrase eterno nombre y fama.",
  "Imaginábase el pobre ya coronado por el valor de su brazo, por lo menos del imperio de Trapisonda; y así, con estos tan agradables pensamientos, llevado del estraño gusto que en ellos sentía, se dio priesa a poner en efeto lo que deseaba. Y lo primero que hizo fue limpiar unas armas que habían sido de sus bisabuelos, que, tomadas de orín y llenas de moho, luengos siglos había que estaban puestas y olvidadas en un rincón. Limpiólas y aderezólas lo mejor que pudo; pero vio que tenían una gran falta, y era que no tenían celada de encaje, sino morrión simple; mas a esto suplió su industria, porque de cartones hizo un modo de media celada, que, encajada con el morrión, hacían una apariencia de celada entera.",
  "Fue luego a ver su rocín, y aunque tenía más cuartos que un real y más tachas que el caballo de Gonela, que «tantum pellis et ossa fuit», le pareció que ni el Bucéfalo de Alejandro ni Babieca el del Cid con él se igualaban. Cuatro días se le pasaron en imaginar qué nombre le pondría; porque, según se decía él a sí mesmo, no era razón que caballo de caballero tan famoso, y tan bueno él por sí, estuviese sin nombre conocido. Y así, después de muchos nombres que formó, borró y quitó, añadió, deshizo y tornó a hacer en su memoria e imaginación, al fin le vino a llamar Rocinante: nombre, a su parecer, alto, sonoro y significativo de lo que había sido cuando fue rocín, antes de lo que ahora era, que era antes y primero de todos los rocines del mundo.",
  "Puesto nombre, y tan a su gusto, a su caballo, quiso ponérsele a sí mismo, y en este pensamiento duró otros ocho días, y al cabo se vino a llamar don Quijote; de donde —como queda dicho— tomaron ocasión los autores desta tan verdadera historia que, sin duda, se debía de llamar Quijada, y no Quesada, como otros quisieron decir.",
  "Pero, acordándose que el valeroso Amadís no sólo se había contentado con llamarse Amadís a secas, sino que añadió el nombre de su reino y patria, por hacerla famosa, y se llamó Amadís de Gaula, así quiso, como buen caballero, añadir al suyo el nombre de la suya y llamarse don Quijote de la Mancha, con que, a su parecer, declaraba muy al vivo su linaje y patria, y la honraba con tomar el sobrenombre della.",
  "Limpias, pues, sus armas, hecho del morrión celada, puesto nombre a su rocín y confirmándose a sí mismo, se dio a entender que no le faltaba otra cosa sino buscar una dama de quien enamorarse; porque el caballero andante sin amores era árbol sin hojas y sin fruto y cuerpo sin alma. Decíase él que, si por malos de sus pecados fuese vencido en algún encuentro, sería bien tener a quién enviar, y que el vencedor le enviase a su señora, para que ella le recibiese por suyo.",
  "Y así, después de haber buscado en su memoria muchos nombres, vino a dar en el de Dulcinea del Toboso, porque ella era natural del Toboso: nombre, a su parecer, músico y peregrino y significativo, como todos los demás que a él y a su caballo había puesto.",
];

for (const p of quijoteText) quijote.paragraph(p);

quijote.y += 4;
quijote.quote(
  "«—Yo sé quién soy —respondió don Quijote—, y sé que puedo ser no sólo los que he dicho, sino todos los doce pares de Francia, y aun todos los nueve de la Fama.»",
  "Capítulo quinto"
);

/* ------------------------------------------------------------------ */
/* Rimas                                                               */
/* ------------------------------------------------------------------ */

const rimas = new Book({
  title: "Rimas",
  author: "Gustavo Adolfo Bécquer",
});

rimas.cover({
  bg: "#173f33",
  ink: "#f1e7ce",
  accent: "#cfae72",
  kicker: "Poesía · Edición de bolsillo",
  title: "Rimas",
  author: "Gustavo Adolfo Bécquer",
  imprint: "Lecty · Clásicos",
  motif: "circles",
});

rimas.contentPage();
rimas.doc.outline.addItem("Sobre esta selección");
rimas.y = 150;
rimas.paragraph("SOBRE ESTA SELECCIÓN", {
  font: "Helvetica-Bold",
  size: 9,
  align: "left",
  color: "#9c7a45",
  gap: 18,
});
rimas.paragraph(
  "Gustavo Adolfo Bécquer (Sevilla, 1836 – Madrid, 1870) publicó en vida apenas una parte de sus Rimas. El conjunto póstumo, ordenado por sus amigos, reúne brevísimos poemas sobre el amor, el tiempo, la memoria y el misterio de la creación poética.",
  { size: 10.5, lineGap: 5 }
);
rimas.paragraph(
  "Esta selección recoge ocho rimas en una edición de lectura pensada para pantalla: mucho aire, tipos suaves y una página por poema.",
  { size: 10.5, lineGap: 5 }
);
rimas.quote(
  "«Poesía... eres tú.»",
  "Rima XXI"
);

rimas.poem(1, [
  "Yo sé un himno gigante y extraño",
  "que anuncia en la noche del alma una aurora,",
  "y estas páginas son de ese himno",
  "cadencias que el aire dilata en las sombras.",
  "",
  "Yo quisiera escribirle, del hombre",
  "domando el rebelde, mezquino idioma,",
  "con palabras que fuesen a un tiempo",
  "suspiros y risas, colores y notas.",
  "",
  "Pero en vano es luchar; que no hay cifra",
  "capaz de encerrarle, y apenas, ¡oh hermosa!,",
  "si, teniendo en mis manos las tuyas,",
  "pudiera, al oído, cantártelo a solas.",
]);

rimas.poem(4, [
  "No digáis que, agotado su tesoro,",
  "de asuntos falta, enmudeció la lira;",
  "podrá no haber poetas; pero siempre",
  "habrá poesía.",
  "",
  "Mientras las ondas de la luz al beso",
  "palpiten encendidas,",
  "mientras el sol las desgarradas nubes",
  "de fuego y oro vista,",
  "",
  "mientras el aire en su regazo lleve",
  "perfumes y armonías,",
  "mientras haya en el mundo primavera,",
  "¡habrá poesía!",
  "",
  "Mientras haya unos ojos que reflejen",
  "los ojos que los miran,",
  "mientras responda el labio a las suspiros",
  "del labio que suspira,",
  "",
  "mientras haya un misterio para el hombre,",
  "¡habrá poesía!",
]);

rimas.poem(11, [
  "—Yo soy ardiente, yo soy morena,",
  "yo soy el símbolo de la pasión;",
  "de ansia de goces mi alma está llena;",
  "¿a mí me buscas? —No es a ti, no.",
  "",
  "—Mi frente es pálida, mis trenzas de oro;",
  "puedo brindarte dichas sin fin;",
  "yo de ternura guardo un tesoro;",
  "¿a mí me llamas? —No, no es a ti.",
  "",
  "—Yo soy un sueño, un imposible,",
  "vano fantasma de niebla y luz;",
  "soy incorpórea, soy intangible;",
  "no puedo amarte. —¡Oh, ven; ven tú!",
]);

rimas.poem(21, [
  "¿Qué es poesía?, dices mientras clavas",
  "en mi pupila tu pupila azul.",
  "¿Qué es poesía? ¿Y tú me lo preguntas?",
  "Poesía... eres tú.",
]);

rimas.poem(23, [
  "Por una mirada, un mundo;",
  "por una sonrisa, un cielo;",
  "por un beso... yo no sé",
  "qué te diera por un beso.",
]);

rimas.poem(30, [
  "Asomaba a sus ojos una lágrima",
  "y a mi labio una frase de perdón;",
  "habló el orgullo y se enjugó su llanto,",
  "y la frase en mis labios expiró.",
  "",
  "Yo voy por un camino, ella por otro;",
  "pero al pensar en nuestro mutuo amor,",
  "yo digo aún: «¿Por qué callé aquel día?»,",
  "y ella dirá: «¿Por qué no lloré yo?»",
]);

rimas.poem(38, [
  "Los suspiros son aire y van al aire.",
  "Las lágrimas son agua y van al mar.",
  "Dime, mujer, cuando el amor se olvida,",
  "¿sabes tú adónde va?",
]);

rimas.poem(53, [
  "Volverán las oscuras golondrinas",
  "en tu balcón sus nidos a colgar,",
  "y otra vez con el ala a sus cristales",
  "jugando llamarán.",
  "",
  "Pero aquellas que el vuelo refrenaban",
  "tu hermosura y mi dicha a contemplar,",
  "aquellas que aprendieron nuestros nombres...",
  "ésas... ¡no volverán!",
  "",
  "Volverán las tupidas madreselvas",
  "de tu jardín las tapias a escalar,",
  "y otra vez a la tarde aún más hermosas",
  "sus flores se abrirán.",
  "",
  "Pero aquellas cuajadas de rocío",
  "cuyas gotas mirábamos temblar",
  "y caer como lágrimas del día...",
  "ésas... ¡no volverán!",
]);

rimas.poem(75, [
  "¿Será verdad que, cuando tomo la pluma,",
  "escribo a oscuras?",
  "¿Será verdad que, cuando sueño, sueño",
  "con los ojos abiertos?",
  "",
  "¿Será verdad que, cuando lloro, lloro",
  "sin motivo?",
  "¿Será verdad que, cuando río, río",
  "sin saber por qué?",
]);

rimas.contentPage();
rimas.doc.outline.addItem("Índice");
rimas.y = 132;
rimas.paragraph("ÍNDICE", {
  font: "Helvetica-Bold",
  size: 9,
  align: "left",
  color: "#9c7a45",
  gap: 16,
});
const rimasIndex = [
  ["I", "Yo sé un himno gigante y extraño"],
  ["IV", "No digáis que, agotado su tesoro"],
  ["XI", "Yo soy ardiente, yo soy morena"],
  ["XXI", "¿Qué es poesía?, dices mientras clavas"],
  ["XXIII", "Por una mirada, un mundo"],
  ["XXX", "Asomaba a sus ojos una lágrima"],
  ["XXXVIII", "Los suspiros son aire y van al aire"],
  ["LIII", "Volverán las oscuras golondrinas"],
  ["LXXV", "¿Será verdad que, cuando tomo la pluma"],
];
for (const [n, t] of rimasIndex) {
  const d = rimas.doc;
  d.font("Times-Bold").fontSize(8.5).fillColor("#8a6428").text(`Rima ${n}`, M, rimas.y, {
    width: 90,
  });
  d.font("Times-Italic").fontSize(10).fillColor(INK).text(t, M + 92, rimas.y - 0.5, {
    width: W - 2 * M - 92,
  });
  d.moveTo(M, rimas.y + 17).lineTo(W - M, rimas.y + 17).lineWidth(0.3).strokeColor(RULE).stroke();
  rimas.y += 26;
}

/* ------------------------------------------------------------------ */
/* Guía de Lecty                                                       */
/* ------------------------------------------------------------------ */

const guia = new Book({
  title: "Guía de Lecty",
  author: "Equipo Lecty",
});

guia.cover({
  bg: "#20323f",
  ink: "#f3eee2",
  accent: "#c9a96a",
  kicker: "Manual de bolsillo",
  title: "Guía de Lecty",
  author: "Tu biblioteca, en páginas",
  imprint: "Lecty · v1.0",
  motif: "lines",
});

guia.chapterOpener(
  "Primeros pasos",
  "Tu biblioteca, en páginas",
  "Lecty convierte tus PDF en libros digitales con paso de hoja. Todo ocurre en tu navegador: no hay cuentas, servidores ni subidas."
);

guia.paragraph(
  "Esta guía breve explica cómo añadir libros, cómo pasar las páginas y qué herramientas tienes a mano mientras lees. Puedes volver a ella siempre que quieras desde la estantería."
);

guia.sectionTitle("Añadir un PDF", "01");
guia.doc.outline.addItem("Añadir un PDF");
guia.paragraph(
  "Pulsa «Añadir PDF» en la cabecera o arrastra uno o varios archivos sobre la estantería. Lecty leerá el título y el autor de los metadatos del documento y generará una portada con la primera página."
);
guia.bullet("Arrastrar y soltar: suelta los PDF en cualquier punto de la ventana.");
guia.bullet("Selector de archivos: admite varios PDF a la vez.");
guia.bullet("Tus archivos se guardan en el almacenamiento local del navegador; no salen de tu equipo.");
guia.tip(
  "Consejo",
  "Si el PDF es muy grande, la primera importación puede tardar unos segundos. Después se abre al instante."
);

guia.sectionTitle("Leer con paso de hoja", "02");
guia.paragraph(
  "Abre un libro desde la estantería y aparecerá el lector. En pantallas grandes verás dos páginas a la vez, como un libro abierto; en el móvil, una sola."
);
guia.bullet("Pulsa la mitad derecha de la página o la flecha → para avanzar.");
guia.bullet("Arrastra la esquina de la hoja con el ratón o el dedo para girarla.");
guia.bullet("Usa las flechas del teclado, la barra espaciadora o las teclas Inicio y Fin.");
guia.tip(
  "Se recuerda todo",
  "Lecty guarda tu progreso, tus marcadores y tus ajustes en este navegador. Al volver, puedes continuar justo donde lo dejaste."
);

guia.sectionTitle("Las herramientas del lector", "03");
guia.doc.outline.addItem("Las herramientas del lector");
guia.paragraph(
  "La barra superior reúne las herramientas de consulta. La inferior sirve para moverse con precisión."
);
guia.bullet("Índice: los capítulos que el propio PDF declara, con salto directo.");
guia.bullet("Miniaturas: una vista general de todas las páginas.");
guia.bullet("Buscar: localiza una palabra o frase en el documento y salta al resultado.");
guia.bullet("Marcador: guarda la página actual con un fragmento del texto.");
guia.bullet("Ajustes: tema del lector, página doble o simple, sonido de hoja y zoom.");
guia.bullet("Pantalla completa: oculta el navegador y deja solo el libro.");

guia.sectionTitle("Atajos de teclado", "04");
guia.doc.outline.addItem("Atajos de teclado");
const shortcuts = [
  ["→  ·  Espacio", "Página siguiente"],
  ["←  ·  Retroceso", "Página anterior"],
  ["Inicio  ·  Fin", "Primera o última página"],
  ["B", "Añadir marcador"],
  ["T", "Abrir el índice"],
  ["F", "Pantalla completa"],
  ["M", "Miniaturas"],
  ["+  ·  −", "Zoom"],
  ["Esc", "Cerrar paneles"],
  ["?", "Esta ayuda"],
];
guia.y += 2;
for (const [k, v] of shortcuts) {
  if (guia.y > H - 90) guia.contentPage();
  const d = guia.doc;
  d.font("Helvetica-Bold").fontSize(8.5).fillColor("#8a6428").text(k, M, guia.y, { width: 112 });
  d.font("Times-Roman").fontSize(9.5).fillColor(INK).text(v, M + 120, guia.y - 0.5, {
    width: W - 2 * M - 120,
  });
  d.moveTo(M, guia.y + 15).lineTo(W - M, guia.y + 15).lineWidth(0.3).strokeColor(RULE).stroke();
  guia.y += 21;
}

guia.sectionTitle("Privacidad y datos", "05");
guia.doc.outline.addItem("Privacidad y datos");
guia.paragraph(
  "Lecty funciona por completo en el navegador. Los PDF que añades se guardan como blobs en IndexedDB y la lectura se renderiza con PDF.js en tu dispositivo. No se envía ningún archivo a un servidor."
);
guia.paragraph(
  "Puedes eliminar un libro importado desde la estantería: pasa el cursor sobre su portada y pulsa el botón de borrar. El progreso y los marcadores asociados también se eliminan."
);
guia.tip(
  "Limitaciones",
  "Los PDF protegidos con contraseña o con capas de seguridad pueden no abrirse. El modo de dos páginas se desactiva en pantallas estrechas."
);

guia.contentPage();
guia.y = 210;
guia.doc.moveTo(M, guia.y).lineTo(W - M, guia.y).lineWidth(0.6).strokeColor("#b08d57").stroke();
guia.paragraph("Esto es todo.", {
  font: "Times-Bold",
  size: 22,
  align: "center",
  gap: 14,
});
guia.paragraph(
  "Ya puedes cerrar esta guía y elegir tu próxima lectura. Buen viaje entre páginas.",
  { font: "Times-Italic", size: 11, align: "center", color: "#5f574c", gap: 24 }
);
guia.paragraph("LECTY", {
  font: "Helvetica",
  size: 7,
  align: "center",
  color: "#9c7a45",
  gap: 0,
});

/* ------------------------------------------------------------------ */

const results = await Promise.all([
  quijote.finish("don-quijote.pdf"),
  rimas.finish("rimas.pdf"),
  guia.finish("lecty-guia.pdf"),
]);

const manifest = [
  {
    id: "don-quijote",
    title: "Don Quijote de la Mancha",
    author: "Miguel de Cervantes",
    subtitle: "Capítulo primero",
    file: "/books/don-quijote.pdf",
    pages: results[0].pages,
    tags: ["Clásico", "Novela"],
    accent: "#7c3b32",
    addedAt: 1735689600000,
    kind: "sample",
  },
  {
    id: "rimas",
    title: "Rimas",
    author: "Gustavo Adolfo Bécquer",
    subtitle: "Selección",
    file: "/books/rimas.pdf",
    pages: results[1].pages,
    tags: ["Poesía", "Clásico"],
    accent: "#2c5546",
    addedAt: 1738368000000,
    kind: "sample",
  },
  {
    id: "lecty-guia",
    title: "Guía de Lecty",
    author: "Equipo Lecty",
    subtitle: "Manual de bolsillo",
    file: "/books/lecty-guia.pdf",
    pages: results[2].pages,
    tags: ["Manual"],
    accent: "#33485c",
    addedAt: 1740787200000,
    kind: "sample",
  },
];

fs.writeFileSync(
  path.join(OUT, "books.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(
  "Libros generados:",
  results.map((r) => `${r.file} (${r.pages} págs.)`).join(", ")
);
