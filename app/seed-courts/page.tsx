"use client";

import { useState } from "react";
import { addCourt } from "@/lib/db";

const RAW_DATA = `
ABŞERON RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-0100, Abşeron rayonu, Xırdalan şəhəri, Kalyubeya küç., 5.
Tel: (012) 342-07-07
Faks: (012) 342-11-44	

AĞCABƏDİ RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-0400, Ağcabədi şəhəri, Ü.Hacıbəyov küç., 153
Tel: (021) 275-18-80, 275-11-28, 275-18-28
Faks: (021) 275-44-55   

AĞDAM RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-0233, Ağdam rayonu, Quzanlı qəsəbəsi.    
Telefon: (026) 325-05-97
Faks:  (026) 325-05-97

AĞDAŞ RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-0300, Ağdaş şəhəri, M.İsayev küç., 17
Tel: 	   	(020) 235-33-33
Faks:	 	(020) 235-50-63

AĞSTAFA RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-0500, Ağstafa şəhəri, H. Əliyev prospekti, 26     
Telefon:       (022) 225-27-93
 Faks:            (022) 225-14-96

AĞSU RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-0600, Ağsu şəhəri, H.Əliyev küç., 135.
Telefon:      (020) 226-50-97, 226-24-54
Faks:           (020) 226-50-97

ASTARA RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-0700, Astara şəhəri, H.Əliyev prospekti, 7
Telefon:        (025) 225-24-40, 225-23-86
Faks:             (025) 225-24-40

BALAKƏN RAYON MƏHKƏMƏSİNƏ

Ünvan:   AZ-0800, Balakən şəhəri, N.Nərimanov küç., 69
Telefon: (0119) 5-17-13, (0119) 5-16-13, (0119) 5-17-14
Faks:      (0198) 5-17-14
BƏRDƏ RAYON MƏHKƏMƏSİNƏ

Ünvan:   AZ-0900, Bərdə şəhəri, Gəncə küç., 45
Telefon: (020) 205-20-52
 Faks:      (020) 205-20-52
BEYLƏQAN RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-1200, Beyləqan şəhəri, SMD-4 qəsəbəsi
Tel: 	   	(02122) 5-29-08, 5-25-09
Faks:	 	(02122) 5-29-08



BİLƏSUVAR RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-1300, Biləsuvar şəhəri, 8 mart küçəsi
Tel:              (0159) 5-22-14, 5-00-46, 5-02-27
Faks:           (02122) 5-00-46, 5-00-27

BİNƏQƏDİ RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-1116 Binəqədi ray, 7 mkr, S.S.Axundov küç 1 
Tel: (012) 412-37-08, 412-25-47   
Faks: (012) 412-47-46	

CƏBRAYIL RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-1400, Biləsuvar rayonu, 1 saylı qəsəbə.    
Telefon:       (0118) 4-39-22
 Faks:            (0118) 4-39-18

CƏLİLABAD RAYON MƏHKƏMƏSİNƏ


   Ünvan:  AZ-1500, Cəlilabad şəhəri, H.Əliyev prospekti, 157
   Tel: (025) 245-34-37, 245-36-25, 245-20-10, 245-55-60
   Faks: (025) 5-34-37

DAŞKƏSƏN RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-1600, Daşkəsən şəhəri, M.Əsədov küç., 17
 Telefon:       (0216) 5-30-66
 Faks:            (0216) 5-30-60
FÜZULİ RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-1924, Horadiz şəhəri, H.Həmidov küç., 16
Telefon:     (0141) 5-51-71, 5-51-72 
Faks:          (0141) 5-51-71

GƏDƏBƏY RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-2100, Gəncə şəhəri, Heydər Əliyev pr. 1
 Telefon:       (02232) 38-48
Faks:            (02232) 38-48

GƏNCƏ ŞƏHƏR MƏHKƏMƏSİ

Ünvan:          AZ-2000, Gəncə şəhəri, Atatürk prospekti, 256
Telefon:        (022)266-20-80
Faks:             (022) 256-02-91

KÜRDƏMİR RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-3300 Kürdəmir şəhəri, H.Əliyev prospekti, 22
Tel: (0145) 5-00-55, 5-23-23, 5-25-25, 5-25-55
Faks:(0145) 5-25-55

GORANBOY RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-2200, Goranboy şəhəri, Vügar Bayramov küçəsi, 3
Tel: (0234) 5-32-77
Faks:(0234) 5-32-77

GÖYÇAY RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-2300, Göyçay şəhəri, Nəriman Nərimanov küç., 56
Telefon:       (0167) 4-00-55, 4-00-83
 Faks:            (0167) 4-18-46

GÖYGÖL RAYON MƏHKƏMƏSİNƏ


Ünvan:          AZ-2500, Göygöl şəhəri, Heydər Əliyev prospekti, 24
Telefon:        (0230) 5-23-44, (0230) 5-23-84
Faks:             (0230) 5-39-92                                                                                                                                        

HACIQABUL  RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-2400, Hacıqabul şəhəri, H.Həmidov küç., 16
Tel: (0140) 4-34-14, (0140) 4-26-27
Faks: (0140) 4-34-14

İMİŞLİ RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-3000, İmişli şəhəri, Sevil Qazıyeva küç.,12
Telefon:        (021) 246-62-35
 Faks:             (021) 246-62-35

İSMAYILLI RAYON MƏHKƏMƏSİNƏ
Ünvan:  AZ-3100, İsmayıllı şəhəri, H.Əliyev prospekti, 14
Tel: (0178) 5-55-92
Faks: (0178) 5-67-33

KƏLBƏCƏR RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-3200, Göygöl şəhəri, H.Əliyev prospekti, 24
 Telefon:       (0230) 5-30-39, 5-48-68
 Faks:            (0230) 5-30-39       
 
LAÇIN RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-4100, Ağcabədi şəhəri, Ü.Hacıbəyov küçəsi 19
Tel: (0113) 5-50-40
Faks: (0113) 5-50-40

LƏNKƏRAN RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-4200, Lənkəran şəhəri, Nizami küç., 3
Telefon:     (02525) 5-33-02, (02525) 5-33-51
 Faks:          (02525) 5-18-98

LERİK RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-4300, Lerik şəhəri, H.Əliyev meydanı, 9
Tel: (0157) 4-51-55, 4-44-96
Faks: (0157) 4-60-03


MASALLI RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-4400, Masallı şəhəri, Heydər Əliyev prospekti, 87
Tel:             (025) 215-33-80, (025) 215-26-18
Faks:           (025) 215-33-22

MİNGƏÇEVİR ŞƏHƏR MƏHKƏMƏSİNƏ

Ünvan:        AZ-4500, Mingəçevir şəhəri, S.Vurğun küç., 16
Telefon:      (024) 274-25-78, (024) 274-49-67, (024)  274-49-09, (024) 274-84-95
Faks:           (024) 274-25-29

NEFTÇALA RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ4700, Neftçala şəhəri, Heydər Əliyev pr.35.    
Telefon:     (0153) 3-39-09
 Faks:          (0153) 3-39-09

NƏRİMANOV RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-1033, Bakı şəhəri, Nərimanov rayonu, Yahya Bakuvi 3
Tel: 	           (012) 404-84-84
Faks:	 	(012) 489-82-12

NƏSİMİ RAYON MƏHKƏMƏSİNƏ
Ünvan: AZ-1102, Bakı şəhəri, A.Məhərrəmov küçəsi, 15
Tel: (012) 431-14-77
Faks: (012) 431-02-05

NİZAMİ RAYON MƏHKƏMƏSİNƏ
Ünvan:         AZ-1060, Bakı şəhəri, Nizami rayonu Məhsəti küç.
Telefon:       (012) 421-08-87
Faks:            (012) 421-08-87
OĞUZ RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-4800, Oğuz şəhəri, Heydər Əliyev prospekti 1.
Telefon:      (2421) 5-26-89 
Faks:            (2421) 5-36-93

PİRALLAHI  RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-1077, Bakı şəhəri, Pirallahı rayonu, Pirallahı qəsəbəsi, S.Vurğun küçəsi 51a
Telefon:        (012) 457-18-71, (012) 457-20-51 
Faks:             (012) 457-19-31 

QARADAĞ RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-1063, Bakı şəhəri Qaradağ rayonu, Lökbatan qəsəbəsi, Bünyədzadə    
küç., 3
Tel: 	           (012) 445-31-84

QAX RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-3400, Qax şəhəri, Azərbaycan prospekti, 16
Telefon:       (0144) 5-24-48
Faks:            (0144) 5-24-48

QAZAX RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-3500, Qazax şəhəri, Səməd Vurğun küç., 29
Tel: (0279) 5-24-19, 5-23-49

NƏSİMİ RAYON MƏHKƏMƏSİNƏ
   Ünvan:  AZ-1102, Bakı şəhəri, A.Məhərrəmov küçəsi, 15
   Tel: (012) 431-14-77
   Faks: (012) 431-02-05

QƏBƏLƏ RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-3600, Qəbələ şəhəri, H.Əliyev pr, 58
Telefon:      
 Faks:           
QOBUSTAN RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-3700, Qobustan şəhəri, M.Ə.Sabir küç., 29a
Tel: 	           (02024) 5-26-25, 5-27-98
Faks:	           (02024) 5-25-81

QUBA RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-4000, Quba şəhəri, Heydər Əliyev prospekti.    
Telefon:       (023)335-62-62
Faks:            (0169) 5-33-10    

QUBADLI RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-5001, Sumqayıt şəhəri, Sülh küç 70.
 Telefon:      (018) 644-57-77
Faks:           (018) 642-08-57


QUSAR RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-3800, Qusar şəhəri, Füzuli küç., 5
Telefon:       (0138) 5-24-42
Faks:            (0138) 5-49-40

SAATLI RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-4900, Saatlı şəhəri, H.Aslanov küç., 1
Telefon:      (0168) 5-32-83
 Faks:           (0168) 5-20-67


SABİRABAD RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-5400, Sabirabad rayonu, Heydər Əliyev prospekti, 69 
Tel: (0143) 5-57-97, 5-72-34
Faks: (0143) 5-55-03

ŞABRAN RAYON MƏHKƏMƏSİ

Ünvan:       AZ-1700, Şabran şəhəri, Qulam Qasımov küç., 6
Telefon:      (0115) 3-20-62, 3-37-11, 3-23-62
Faks:           (0115) 3-20-62


SABUNÇU RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-1040, Bakı şəhəri, Bakıxanov qəsəbəsi, Oskar Əfəndiyev küçəsi 8
Tel: 	   	(012) 525-20-72
Faks:	 	(012) 452-63-86

SALYAN RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-5200, Salyan şəhəri, Əli Zeynalov küç., 91
Telefon:        (0163) 4-50-14, 4-22-35
Faks:             (0163) 4-50-14

ŞAMAXI RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-5600, Şamaxı rayonu, Çənclər küç., 22
Telefon:       (02026) 527 74
Faks:            (02026) 534 08


XANKƏNDİ ŞƏHƏR MƏHKƏMƏSİNƏ

Ünvan: AZ2600, Xankəndi şəhəri
Telefon: 
Faks: 
 
SAMUX RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-5100, Samux şəhəri, Arif Nəbiyev küç., 40
Telefon:        (0265) 5-10-86
Faks:             (0265) 5-10-86


SƏBAİL RAYON MƏHKƏMƏSİNƏ
Ünvan: AZ-1003, Bakı şəhəri, Səbail rayonu, M.Useynov küçəsi, 5
Tel: (012) 491-67-26, 491-21-81
Faks: (012) 491-32-15

ŞƏKİ RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-5500, Şəki şəhəri, S.Mümtaz küç., 1
Tel: (024) 4-35-25, 244-30-70, 244-08-37, 244-26-36
Faks: (024) 244-35-25, 244-30-70


ŞƏMKİR RAYON MƏHKƏMƏSİNƏ

Ünvan:          AZ-5700, Şəmkir şəhəri, H.Əliyev prospekti, 2	
Telefon:        (0241) 5-74-07
 Faks:             (0241) 5-35-24

ŞİRVAN ŞƏHƏR MƏHKƏMƏSİNƏ

Ünvan:         AZ-1800, Şirvan şəhəri, 20 Yanvar küçəsi 16
Telefon:       (0197) 5-42-36
Faks:            (0197) 5-01-51

SİYƏZƏN RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-5300, Siyəzən şəhəri, Bəşir Səfəroğlu küç., 47
Telefon:      (0190) 4-00-61, 4-28-44
 Faks:           (0190) 4-07-70

SUMQAYIT ŞƏHƏR MƏHKƏMƏSİNƏ

Ünvan: AZ-5001, Sumqayıt şəhəri, Sülh küçəsi 70
Tel: (01864) 4-37-29
Faks:  (01864) 4-37-29

SURAXANI RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-1042, Bakı şəhəri, Əmircan qəsəbəsi, Səttar Bəhlulzadə küç 312.
Tel: (012) 425-03-99
Faks: :(012) 458-44-00

ŞUŞA RAYXON MƏHKƏMƏSİ

Ünvan: AZ-0100, Xırdalan şəhəri, Abşeron rayonu H.Əliyev küç., 39
Telefon: (012) 342-19-89, 342-30-04
   Faks: (012) 342-80-44

TƏRTƏR RAYON MƏHKƏMƏSİNƏ

Ünvan:    AZ-5900, Tərtər şəhəri, H.Əliyev prospekti, 45
Telefon:  6-39-99, 6-39-09, 6-31-74
   Faks:
TOVUZ  RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-6000, Tovuz şəhəri, A.Qasımov küç., 17
Tel: 	   	(0231) 5-00-20, (0231) 5-00-30
Faks:	 	(0231) 5-30-26


UCAR RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-6100, Ucar şəhəri, Səttərxan küç., 1
 Telefon:      (0170) 3-15-40
 Faks:           (0170) 3-01-11

XAÇMAZ  RAYON MƏHKƏMƏSİNƏ

Ünvan:           AZ-2700, Xaçmaz şəhəri, Nəsimi küç., 8
Telefon:         (023) 325-00-25, 325-00-35
Faks:              (023) 325-00-50, 325-00-40

XƏTAİ RAYON MƏHKƏMƏSİNƏ

Ünvan:         AZ-1149, Bakı şəhəri, Xətai rayonu, Məhəmməd Hadi küç. 249
Telefon:       (012) 374-96-25
 Faks:            (012) 374-96-36

XƏZƏR RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-1044, Bakı şəhəri, Xəzər rayonu, Mərdəkan qəsəbəsi, Telman küç., 4        
Tel: (012) 310-07-75
Faks: (012) 454-42-22

XIZI RAYON MƏHKƏMƏSİNƏ

Ünvan:       AZ-8000, Xızı şəhəri, Turqut Özal küç.
Telefon:      (0199) 5-05-00, 5-02-38
Faks:           (0199) 5-05-41

XOCALI RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-2212, Goranboy rayonu, Ağcakənd kəndi.    
Telefon:       (0234) 97-6-52
Faks:            (0234) 97-6-53  


XOCAVƏND  RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-1200, Beyləqan şəhəri, SMD-4 qəsəbəsi.    
Telefon:       (0152) 5-14-26, 5-28-35
Faks:            (0152) 5-12-64


YARDIMLI RAYON MƏHKƏMƏSİNƏ


Ünvan: 	AZ-6500, Yardımlı şəhəri, Bəhruz Mansurov küç., 1
Tel: 	           (0175) 6-10-76
Faks:    	(0175) 6-11-36 


YASAMAL RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-1138, Bakı şəhəri, Mikayıl Müşviq küç. 1H
Tel: 	   	(012) 510-74-99
Faks:	 	(012) 537-22-76


YEVLAX RAYON MƏHKƏMƏSİNƏ

Ünvan: 	AZ-6600, Yevlax rayonu, C.Cabbarlı küç., 9
Tel: (0166) 6-13-80, (0166) 6-31-76, (0166) 6-31-80, (0166) 6-47-66
Faks:(0166) 6-47-66

ZAQATALA RAYON MƏHKƏMƏSİNƏ

Ünvan: 	  AZ-6200, Zaqatala şəhəri, 28 may küç., 46
Tel: (0174) 5-37-97, 5-23-81, 5-44-28, 5-39-76
Faks:(0174) 5-37-97, 5-23-81

ZƏNGİLAN RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-1116, Bakı şəhəri, A.Məhərrəmov küç., 15
Tel: (012) 431-53-98

ZƏRDAB RAYON MƏHKƏMƏSİNƏ

Ünvan:        AZ-6300, Zərdab şəhəri, Nizami küç.18
Telefon:       (0135) 6-46-62, 6-49-93
 Faks:            (0135) 6-46-62

NAXÇIVAN MR BABƏK RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-6700, Naxçıvan Muxtar Respublikası, Babək rayonu, Babək qəsəbəsi, H.Əliyev prospekti.
Tel: (0136) 41-41-77
Faks: 
	
NAXÇIVAN MR CULFA RAYON MƏHKƏMƏSİ

Ünvan: 	  AZ-7200, Culfa şəhəri, Şəhid Əliqulu küç.
Tel: 	             (0136) 46-05-38, 46-12-06
Faks:	             (0136) 46-11-30

NAXÇIVAN MR KƏNGƏRLİ RAYON MƏHKƏMƏSİ

Ünvan: 	  AZ-7400, Kəngərli rayonu, Qıvraq qəsəbəsi
Tel: 	             (0136) 48-12-38
Faks:	             (0136) 48-08-58

NAFTALAN ŞƏHƏR MƏHKƏMƏSİNƏ


Ünvan:        AZ-4600, Naftalan şəhəri, S.Vurğun küçəsi 47
Tel:              (0255) 2-30-21
Faks:           (0255) 2-30-21

NAXÇIVAN MR NAXÇIVAN ŞƏHƏR MƏHKƏMƏSİNƏ

Ünvan: AZ-7000, Naxçıvan şəhəri, Əziz Əliyev küç., 20.
Tel: (036) 545-78-41, 545-78-42
Faks: (036) 545-78-43



NAXÇIVAN MR ORDUBAD RAYON MƏHKƏMƏSİNƏ

Ünvan:   AZ-6900, Ordubad şəhəri, Mənsur Ağa küç., 8
Telefon: (0136) 47-14-15
Faks:      

NAXÇIVAN MR ŞAHBUZ  RAYON MƏHKƏMƏSİ  


Ünvan: AZ-7100, Şahbuz şəhəri, H.Ə.Əliyev küç..
Tel: (0136) 430-01-10
Faks: (0136)


NAXÇIVAN MR SƏDƏRƏK RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-7300, Sədərək rayonu, Heydərabad qəsəbəsi
Telefon: Telefon: 49-21-33, 49-21-31
Faks:         


NAXÇIVAN MR ŞƏRUR RAYON MƏHKƏMƏSİNƏ

Ünvan: AZ-6800, Şərur şəhəri, 28 May küç., 3.
Tel: 42-32-36, 42-46-42
Faks: 42-25-95
`;

export default function SeedCourtsPage() {
    const [status, setStatus] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const parseAndSeed = async () => {
        setLoading(true);
        try {
            // 1. Delete existing
            setStatus("Mövcud məlumatlar silinir...");
            const { getCourts, deleteCourt } = await import("@/lib/db");
            const existing = await getCourts();
            for (const c of existing) {
                await deleteCourt(c.id);
            }
            setStatus(`Silindi: ${existing.length} məhkəmə. Yeni məlumatlar emal edilir...`);

            // 2. Parse
            const lines = RAW_DATA.split('\n').map(l => l.trim()).filter(Boolean);
            const courts = [];
            let currentCourt: any = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lowerLine = line.toLowerCase();

                const isAddress = lowerLine.startsWith("ünvan");
                const isPhone = lowerLine.startsWith("tel") || lowerLine.startsWith("telefon");
                const isFax = lowerLine.startsWith("faks");

                if (isAddress || isPhone || isFax) {
                    if (!currentCourt) {
                        currentCourt = { name: "Bilinməyən", address: "", phone: "", fax: "" };
                        courts.push(currentCourt);
                    }
                    if (isAddress) currentCourt.address = line.replace(/^ünvan\s*:?\s*/i, "").trim();
                    if (isPhone) currentCourt.phone = line.replace(/^(telefon|tel)\s*:?\s*/i, "").trim();
                    if (isFax) currentCourt.fax = line.replace(/^faks\s*:?\s*/i, "").trim();
                } else {
                    // It's a name candidate or a continuation of address
                    // If the current line is short and previous line was address, it's likely address continuation
                    const prevLine = i > 0 ? lines[i - 1].toLowerCase() : "";
                    const isContinuation = (prevLine.startsWith("ünvan") || (currentCourt && currentCourt.address && !currentCourt.phone && !currentCourt.fax)) &&
                        (line.includes("küç") || line.includes("pr") || /^\d+/.test(line) || line.length < 20);

                    if (isContinuation && currentCourt) {
                        currentCourt.address = (currentCourt.address + " " + line).trim();
                    } else {
                        currentCourt = { name: line, address: "", phone: "", fax: "" };
                        courts.push(currentCourt);
                    }
                }
            }

            setStatus(`${courts.length} məhkəmə tapıldı. Yükləmə başlayır...`);

            // 3. Upload
            let count = 0;
            for (const court of courts) {
                if (!court.name || court.name.length < 5) continue;
                if (!court.address && !court.phone) continue;

                await addCourt(court);
                count++;
                setStatus(`Yükləndi (${count}/${courts.length}): ${court.name}`);
                await new Promise(r => setTimeout(r, 50));
            }

            setStatus(`Uğurla tamamlandı! ${count} məhkəmə əlavə edildi.`);
        } catch (e: any) {
            console.error(e);
            setStatus(`Xəta baş verdi: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-10 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Seed Courts</h1>
            <div className="mb-4 text-sm text-gray-600">
                Click below to parse and upload the hardcoded court data to Firestore.
            </div>

            <button
                onClick={parseAndSeed}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? "Processing..." : "Start Seeding"}
            </button>

            <div className="mt-6 p-4 border rounded bg-gray-50 font-mono text-sm h-64 overflow-auto">
                {status || "Ready..."}
            </div>
        </div>
    );
}
