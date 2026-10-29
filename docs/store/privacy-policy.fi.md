# Tietosuojaseloste

> **Luonnos.** Ei vielä julkaistu. Päivämäärä: [PP.KK.VVVV – täytetään ennen julkaisua]. Yhteystieto: [omistajan sähköposti – täytetään ennen julkaisua].

Satanen on lukusovellus Yle Teksti-TV:lle. Tämä seloste kertoo, mitä tietoja sovellus käsittelee ja mitä se ei tee.

## Lyhyesti

- Ei käyttäjätilejä.
- Ei evästeitä, mainoksia eikä ostoja. Sivujen lukukerrat ja lukijoiden määrä lasketaan päiväkohtaisella tunnisteella (ks. alla).
- Ei seurantaa: tunniste vaihtuu joka päivä, eikä lukijaa voi seurata päivästä toiseen.
- Ei käyttäjätietokantaa.
- Suosikit, viimeksi luetut sivut ja asetukset pysyvät laitteellasi.

## Mitä laitteellesi tallennetaan

Sovellus tallentaa laitteen omaan tallennustilaan suosikit, viimeksi luetut sivut ja asetukset, kuten teeman. Lisäksi viimeksi luetut sivut säilytetään laitteella, jotta ne voi avata ilman verkkoyhteyttä. Nämä tiedot eivät lähde laitteeltasi.

Voit tyhjentää tallennetut sivut ja viimeksi luetut sivut sovelluksen asetuksissa. Kaikki tiedot poistuvat, kun poistat sovelluksen. Jos käytät verkkosovellusta, tiedot poistuvat, kun tyhjennät selaimen tiedot.

## Sivujen hakeminen

Kun avaat sivun, sovellus hakee sen Cloudflarella toimivan välityspalvelun kautta (api.satanen.io). Välityspalvelu välittää pyynnön Ylen julkiseen Teksti-TV-rajapintaan ja pitää sivua hetken välimuistissa, jotta Ylelle ei tule turhia pyyntöjä. Välimuisti säilyttää sivua sivutyypin mukaan: suorat urheilutulokset 1 minuutin, otsikkolistat 2 minuuttia, uutisartikkelit 5 minuuttia, ja tv-ohjelmat, sää ja muut sivut 30 minuuttia. Puuttuvaa sivua (404) muistetaan 30 sekuntia, virheitä ei muisteta lainkaan. Kun Ylen pyyntöraja alkaa täyttyä, ajat tuplataan. Selain tai sovellus voi lisäksi pitää sivua itse enintään neljänneksen näistä ajoista, kuitenkin enintään 2 minuuttia. Jos Yle ei vastaa, välityspalvelu voi näyttää enintään vuorokauden vanhan kopion sivusta. Välimuistissa on vain julkisia Teksti-TV-sivuja, ei tietoja sinusta.

Cloudflare käsittelee palvelun tarjoamiseen ja suojaamiseen liittyviä tavallisia teknisiä tietoja, kuten IP-osoitteen, pyynnön ajankohdan ja pyydetyn sivun. Emme käytä näitä tietoja sinun tunnistamiseesi. Cloudflare käsittelee tietoja omien ehtojensa mukaisesti.

Sovellus ei lähetä Ylelle tietoja sinusta. Yle näkee pyynnöt välityspalvelusta, ei sinun laitteeltasi.

## Lukumäärät ja päiväkohtainen tunniste

Haluamme tietää, mitä sivuja luetaan eniten ja kuinka monta lukijaa päivässä on. Kun avaat sivun, sovellus ilmoittaa välityspalvelulle vain sivun numeron. Välityspalvelu tallentaa tilastoon sivun numeron, maan (Cloudflaren antama), tiedon siitä, onko kyse verkkosovelluksesta vai Android-sovelluksesta, sekä päiväkohtaisen tunnisteen.

Päiväkohtainen tunniste on lyhyt tunnus, jonka välityspalvelu laskee salaisella avaimella päivämäärästä, IP-osoitteesta ja selaimen tai laitteen tyyppitiedosta. Se on siis pseudonyymi tunniste, ei täysin nimetön: saman päivän aikana sama lukija saa saman tunnisteen, ja sen avulla näemme, kuinka monta eri lukijaa päivässä on. Tunniste vaihtuu joka päivä, eikä sitä voi yhdistää eri päiviin. Käytämme sitä vain lukijoiden määrän laskemiseen päivässä.

IP-osoitetta ja laitteen tyyppitietoa ei tallenneta tilastoon, lokiin tai vastaukseen. Välityspalvelun pyyntölokit on kytketty pois päältä. Lisäksi välityspalvelu laskee Ylelle lähetetyt pyynnöt, jotta Ylen pyyntörajaa voidaan seurata. Niihin ei liity tietoja lukijasta.

Laskemiseen ei käytetä evästeitä, eikä puhelimeesi tai selaimeesi tallenneta mitään. Käyttäjätiliä ei ole eikä tule. Tilastot säilyvät Cloudflaren Analytics Engine -palvelussa noin kolme kuukautta.

## Mainokset ja ostot

Sovelluksessa ei ole mainoksia eikä sovelluksen sisäisiä ostoja. Sovellus ei kysy nimeä, sähköpostiosoitetta tai muitakaan henkilötietoja.

## Sisältö ja tekijänoikeudet

Sisältö: Yle Teksti-TV. Satanen on itsenäinen sovellus, eikä se ole Ylen tekemä tai hyväksymä tuote. Sisältöä ei muokata sanallisesti, vaan se asetellaan uudelleen luettavampaan muotoon.

## Muutokset

Jos tämä seloste muuttuu, uusi versio julkaistaan tällä sivulla ja päivämäärä päivitetään.

## Yhteys

Kysymykset tietosuojasta: [omistajan sähköposti – täytetään ennen julkaisua].
