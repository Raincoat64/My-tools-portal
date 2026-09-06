// 公開資料の所在・手続きカタログ。法令上の提出事項と県の案内は分離する。
const VERSION = '2.0.0';
const REVIEW_DATE = '2026-09-05';
const LAWS = [
 {id:ACT,name:'高圧ガス保安法',short:'法'}, {id:ORDER,name:'高圧ガス保安法施行令',short:'施行令'},
 {id:REITOU,name:'冷凍保安規則',short:'冷凍則'}, {id:IPPAN,name:'一般高圧ガス保安規則',short:'一般則'},
 {id:EKISEKI,name:'液化石油ガス保安規則',short:'液石則'}, {id:'341M50000400050',name:'容器保安規則',short:'容器則'}
];
const SOURCES = {
 manufacture:'https://www.pref.nara.lg.jp/n011/39584.html',
 storage:'https://www.pref.nara.lg.jp/n011/39585.html', sales:'https://www.pref.nara.lg.jp/n011/39586.html',
 consumption:'https://www.pref.nara.lg.jp/n011/39587.html', company:'https://www.pref.nara.lg.jp/n011/39588.html',
 newForm:'https://www.pref.nara.lg.jp/documents/409/20260129090948.docx',
 newList:'https://www.pref.nara.lg.jp/documents/409/20260129090948.xlsx',
 changeList:'https://www.pref.nara.lg.jp/documents/409/20260129090948_1.xlsx',
 meti:'https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/hipregas/hourei/kouatu_kokuji.html'
};
const ref = (law,num,detail='') => ({law,num:String(num),detail});
const PROCEDURES = [
 {id:'cold-new',title:'高圧ガス製造届',subtitle:'冷凍・第二種製造者',keywords:'冷凍 第二種 2種 二種 新設 設置 届出 チラー 空調',tag:'書類案内',deadline:'製造開始の日の20日前まで',description:'冷凍の第二種製造者として新たに届け出るときの書類を確認します。',refs:[ref(ACT,5,'第2項'),ref(REITOU,4)],source:'manufacture'},
 {id:'cold-change',title:'高圧ガス製造施設等変更届',subtitle:'冷凍・第二種製造者',keywords:'冷凍 第二種 変更 増設 交換 更新 配管',tag:'書類案内',deadline:'変更の前に、あらかじめ届出',description:'軽微な変更の工事に該当しない、第二種製造者の変更手続きです。',refs:[ref(ACT,14,'第4項'),ref(REITOU,18),ref(REITOU,19)],source:'manufacture'},
 {id:'cold-permit',title:'高圧ガス製造施設等変更許可申請',subtitle:'冷凍・第一種製造者',keywords:'冷凍 第一種 変更 許可 1種',tag:'書類案内',deadline:'変更の前に許可を受ける',description:'軽微な変更の工事に該当しない、第一種製造者の変更手続きです。',refs:[ref(ACT,14,'第1項'),ref(REITOU,16),ref(REITOU,17)],source:'manufacture'},
 {id:'cold-minor',title:'高圧ガス製造施設軽微変更届',subtitle:'冷凍・第一種製造者',keywords:'冷凍 第一種 軽微 変更 届出 交換 撤去',tag:'書類案内',deadline:'工事完成後、遅滞なく届出',description:'第一種製造者が軽微な変更の工事を行った場合の届出です。',refs:[ref(ACT,14,'第2項'),ref(REITOU,17)],source:'manufacture'},
 {id:'manufacture',title:'製造の許可・届出',subtitle:'一般則・液石則・冷凍則',keywords:'一般 液石 製造 新設 許可 第二種 第一種',tag:'公式資料',description:'製造区分の目安と、許可・届出の公式案内を確認します。',refs:[ref(ACT,5)],source:'manufacture'},
 {id:'storage',title:'貯蔵所の設置・変更',subtitle:'第一種・第二種貯蔵所',keywords:'貯蔵 設置 変更 容器 ボンベ タンク',tag:'公式資料',description:'貯蔵所の許可・届出及び関係資料を確認します。',refs:[ref(ACT,16),ref(ACT,'17_2')],source:'storage'},
 {id:'sales',title:'販売事業の届出',subtitle:'販売を始める・変更する',keywords:'販売 事業 届出 冷媒 ボンベ',tag:'公式資料',description:'販売事業の届出と関係資料を確認します。',refs:[ref(ACT,'20_4')],source:'sales'},
 {id:'consumption',title:'特定高圧ガスの消費',subtitle:'消費を始める・変更する',keywords:'特定 消費 使用 酸素 水素 アンモニア',tag:'公式資料',description:'特定高圧ガス消費者の届出と関係資料を確認します。',refs:[ref(ACT,'24_2')],source:'consumption'},
 {id:'inspection',title:'完成検査・保安検査',subtitle:'検査の申請・受検後の届出',keywords:'完成 検査 保安 検査 受検',tag:'公式資料',description:'対象施設・工事と検査の要否を根拠から確認します。',refs:[ref(ACT,20),ref(ACT,35),ref(REITOU,23)],source:'manufacture'},
 {id:'personnel',title:'保安責任者等の選任・解任',subtitle:'担当者を変更する',keywords:'担当 責任者 選任 解任 代理 免状',tag:'公式資料',description:'設備の種類・能力・適用除外によって選任義務が異なります。',refs:[ref(ACT,'27_4'),ref(REITOU,36)],source:'manufacture'},
 {id:'company',title:'承継・会社情報変更・廃止',subtitle:'事業主体や会社情報を変更する',keywords:'承継 譲渡 相続 合併 分割 社名 代表者 住所 廃止',tag:'公式資料',description:'代表者変更と事業主体の変更では手続きが異なります。',refs:[ref(ACT,10),ref(ACT,'10_2'),ref(ACT,21)],source:'company'},
 {id:'suspend',title:'製造施設の休止・再開',subtitle:'設備を止める・使い始める',keywords:'休止 再開 停止 使用 開始',tag:'公式資料',description:'休止施設の範囲・保安措置と、再開時の取扱いを確認します。',refs:[ref(ACT,35)],source:'manufacture'}
];
const DETAIL_FIELDS = [
 '製造の目的','製造設備の種類','一日の冷凍能力','圧縮機の性能','法第12条第1項・第2項の技術上の基準に関する事項'
];
const NARA_DOCS = [
 ['location','製造施設の位置・付近の状況を示す図面','地図等。変更届では該当する場合。','required','conditional'],
 ['site','事業所全体平面図','変更届では該当する場合。','required','conditional'],
 ['process','製造工程の概要を説明する書面・図面','変更届では変更前後を示します。','required','required'],
 ['piping','フローシート又は配管図','変更届では変更前後を示します。','required','required'],
 ['layout','高圧ガス製造施設配置図','変更届では変更前後を示します。','required','required'],
 ['equipment','機器等一覧表','変更届では変更前後を示します。','required','required'],
 ['evidence','機器の内容が確認できる書面','図面、成績書、強度計算書等。必要な組合せを確認します。','required','required'],
 ['capacity','処理能力・貯蔵能力の計算書','県共通一覧の名称です。冷凍能力に係る資料等、設備に対応する内容を確認します。','required','conditional'],
 ['additional','設備に応じて必要な書面・図面','技術上の基準に対応するその他の資料。','conditional','conditional']
];
const CHANGE_KINDS = [
 ['replace','製造設備の取替え'],['remove','独立した製造設備の撤去'],['ancillary','製造設備以外の設備の取替え'],
 ['installDesignated','認定指定設備の設置'],['designated','認定指定設備の変更・移設'],['other','増設・配管改造・その他の変更']
];
const THEMES = [
 {title:'製造区分・冷凍能力',description:'許可・届出の基準と冷凍能力の算定',refs:[ref(ACT,5),ref(ORDER,4),ref(REITOU,5)]},
 {title:'変更工事・軽微変更',description:'第一種・第二種の変更手続きと例外',refs:[ref(ACT,14),ref(REITOU,17),ref(REITOU,19)]},
 {title:'材料・強度・耐圧・気密',description:'冷凍設備の技術上の基準から確認',refs:[ref(REITOU,7),ref(REITOU,12),ref(REITOU,13)]},
 {title:'安全装置・配置・保安措置',description:'設備区分に応じた基準を確認',refs:[ref(REITOU,7),ref(REITOU,12),ref(REITOU,13)]},
 {title:'保安教育・危害予防規程',description:'第一種と第二種で異なる義務',refs:[ref(ACT,26),ref(ACT,27)]},
 {title:'認定指定設備',description:'認定証と変更・移設時の扱い',refs:[ref(REITOU,4),ref(REITOU,62)]}
];
