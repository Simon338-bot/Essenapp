'use strict';
// Koch-Wörterbuch für die Korrektur von Lesefehlern beim Scannen.
// Grundformen genügen – Endungen (-n, -en, -e, -s, -er) werden beim Vergleich berücksichtigt.
window.RECIPE_VOCAB = `
zutaten zubereitung zubereitungszeit backzeit kochzeit ruhezeit garzeit arbeitszeit portionen personen stück stücke
tipp tipps hinweis variante dekoration verzierung füllung belag teig boden guss glasur creme sahne streusel
für den die das der dem des mit und oder ohne etwas etwa ca circa nach vor bei auf aus zum zur unter über
mehl weizenmehl dinkelmehl roggenmehl vollkornmehl speisestärke stärke maisstärke backpulver natron hefe trockenhefe
zucker puderzucker rohrzucker vanillezucker vanillinzucker gelierzucker brauner hagelzucker honig ahornsirup sirup
salz pfeffer prise muskat muskatnuss zimt nelken kardamom anis ingwer kurkuma curry paprikapulver kreuzkümmel kümmel
chili cayennepfeffer oregano basilikum thymian rosmarin petersilie schnittlauch dill koriander minze salbei majoran
lorbeer lorbeerblatt knoblauch knoblauchzehe zwiebel zwiebeln schalotte frühlingszwiebel lauch porree sellerie
butter margarine öl olivenöl sonnenblumenöl rapsöl pflanzenöl kokosöl schmalz
milch vollmilch buttermilch kondensmilch sahne schlagsahne schmand sauerrahm crème fraîche frischkäse quark magerquark
joghurt naturjoghurt mascarpone ricotta mozzarella parmesan gouda emmentaler feta käse reibekäse bergkäse ziegenkäse
ei eier eigelb eiweiß eiklar
schokolade zartbitterschokolade vollmilchschokolade kuvertüre kakao kakaopulver schokoraspel schokoraspeln schokotropfen
nüsse haselnüsse walnüsse mandeln mandelblättchen erdnüsse erdnussbutter pistazien cashewkerne kokosraspel kokosflocken
rosinen sultaninen marzipan nougat krokant mohn sesam leinsamen haferflocken müsli cornflakes
apfel äpfel birne birnen kirsche kirschen sauerkirschen zwetschge zwetschgen pflaume pflaumen mirabellen aprikose aprikosen
pfirsich pfirsiche erdbeere erdbeeren himbeere himbeeren heidelbeere heidelbeeren blaubeeren johannisbeeren stachelbeeren
brombeeren beeren rhabarber banane bananen zitrone zitronen limette orange orangen mandarine mandarinen ananas mango
kiwi trauben weintrauben melone feigen datteln quitte obst früchte saft zitronensaft orangensaft apfelsaft
abrieb schale zitronenschale orangenschale
kartoffel kartoffeln süßkartoffel möhre möhren karotte karotten tomate tomaten gurke gurken paprika zucchini aubergine
kürbis spinat brokkoli blumenkohl rosenkohl weißkohl rotkohl wirsing kohlrabi spargel erbsen bohnen linsen kichererbsen
mais champignons pilze steinpilze pfifferlinge salat eisbergsalat rucola feldsalat radieschen rote bete avocado oliven kapern
nudeln spaghetti penne tagliatelle lasagne makkaroni spätzle gnocchi reis basmatireis risottoreis couscous bulgur quinoa
polenta grieß graupen brot brötchen toast baguette semmelbrösel paniermehl
fleisch rindfleisch schweinefleisch kalbfleisch lammfleisch hackfleisch hähnchen hähnchenbrust hühnchen pute putenbrust
ente gans speck schinken bacon wurst würstchen salami bratwurst leberkäse gulasch schnitzel steak filet braten
fisch lachs lachsfilet forelle thunfisch kabeljau seelachs zander hering garnelen shrimps krabben muscheln
brühe gemüsebrühe fleischbrühe hühnerbrühe fond wein weißwein rotwein sekt rum likör eierlikör amaretto bier wasser
essig balsamico senf ketchup mayonnaise sojasauce tomatenmark passierte gelatine agar pudding puddingpulver vanillepudding
sahnesteif tortenguss konfitüre marmelade gelee
backofen ofen herd pfanne topf kochtopf schüssel rührschüssel springform kastenform gugelhupfform tarteform auflaufform
backblech blech backpapier muffinform förmchen papierförmchen rost gitter kuchengitter tortenring tortenplatte
handrührgerät rührgerät mixer küchenmaschine schneebesen teigschaber nudelholz messer gabel löffel esslöffel teelöffel
tasse tassen becher glas gläser päckchen packung dose dosen beutel bund zehe zehen scheibe scheiben würfel stange
gramm kilogramm liter milliliter el tl msp prise grad umluft oberhitze unterhitze minuten stunden stunde minute
vorheizen heizen backen kochen braten garen dünsten schmoren köcheln aufkochen erhitzen schmelzen rösten grillen frittieren
rühren verrühren unterrühren umrühren schlagen aufschlagen steif schaumig cremig glatt verquirlen mischen vermischen
vermengen verkneten kneten unterheben heben ausrollen ausstechen formen füllen einfüllen streichen verstreichen bestreichen
bestreuen streuen verteilen belegen schichten garnieren verzieren dekorieren bestäuben überziehen tränken beträufeln
schneiden schälen entkernen entsteinen halbieren vierteln würfeln hacken reiben raspeln pürieren zerdrücken auspressen
waschen abtropfen abgießen abkühlen auskühlen kühlen kaltstellen einfrieren auftauen ruhen gehen lassen quellen ziehen
fetten einfetten mehlen bemehlen auslegen stürzen lösen servieren anrichten abschmecken würzen salzen pfeffern
gebacken gekocht gebraten geschmolzen geschlagen gehackt gerieben geschält gewürfelt gemahlen gehobelt abgetropft
weich weiche warm warme kalt kalte heiß heiße lauwarm zimmerwarm flüssig fest dick dünn fein grob klein groß ganz
frisch frische reif reife süß süße sauer salzig saftig locker knusprig goldbraun hell dunkel leicht schnell einfach
kuchen torte torten blechkuchen rührkuchen obstkuchen käsekuchen streuselkuchen marmorkuchen gugelhupf napfkuchen
zitronenkuchen schokokuchen schokoladenkuchen nusskuchen apfelkuchen kirschkuchen zwetschgenkuchen pflaumenkuchen
rhabarberkuchen erdbeerkuchen birnenkuchen bienenstich donauwelle butterkuchen zuckerkuchen hefezopf hefekuchen
muffins cupcakes brownies cookies kekse plätzchen waffeln pfannkuchen crêpes kaiserschmarrn strudel
cheesecake tiramisu mousse dessert nachtisch nachspeise vorspeise hauptgericht beilage suppe eintopf auflauf
salatdressing dressing vinaigrette soße sauce dip aufstrich snack fingerfood frühstück getränk smoothie bowle punsch
schwarzwälder frau holle kalter hund maulwurfkuchen zupfkuchen eierschecke omas mamas großmutter rezept
`.split(/\s+/).filter(Boolean);
