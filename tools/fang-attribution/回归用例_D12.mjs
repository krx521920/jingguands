/** 公开受控边界：独立规定预期；复用 D9 事实构造器，不读取实际判定反填预期。 */
export function buildCases(makePair){
  // 新受控 A 使用正式 v0.3 字段与单位；金额 value 先以显式测试常量写成基准单位。
  const pair=(left={},right={})=>{
    const configs=[left,right].map(c=>c.currency?{...c,field:'bid_amount',unit:'cny',raw:c.raw??`${c.value??'100'}元`}:c);
    const x=makePair(...configs);
    x.input.sides.forEach((s,i)=>{
      const env=x.options.documents[s.case_id],event=env.events[0];
      env.source.file_name=s.case_id+'.synthetic.txt';env.run_meta={entry:'tool',interface_version:'v0.3'};
      event.event_id='E01';event.event_type=configs[i].currency?'award_contract':'equity_change';event.extraction_method='mock';
      if(configs[i].currency){event.fields.bidder=event.fields.holder;delete event.fields.holder;}
      for(const f of Object.values(event.fields)){
        f.raw_value??=String(f.value);f.unit??='text';f.standardized=true;
        f.provenance=f.provenance.map(({file_sha256,...p})=>({...p,source_type:'paragraph'}));
      }
    });
    return x;
  };
  const money={unit:'amount',currency:'CNY',tax:'含税'},cases=[];
  const add=(id,reason,x,verdict,code,result=null)=>cases.push({id,reason,...x,expected:{verdict,code,result}});
  const tax=(rate='6',stated='6',gross='106',raw='100元')=>pair({...money,value:'100',raw,tax:'不含税',extra:`本项目税率${stated}%`,facts:{tax_rate:{value:rate}}},{...money,value:gross});
  const fx=(quote='2026-10-05，1 AED = 2 CNY',raw='100元')=>pair({...money,currency:'AED',value:'100',raw,extra:quote,facts:{fx:{value:'2',from:'AED',to:'CNY',date:'2026-10-05'}}},{...money,value:'200'});
  add('D12-T01','16% 不能充当 6% 的依据',tax('6','16'),'insufficient','TAX_RATE_MISSING');
  add('D12-T02','6.5% 不能充当 0.5% 的依据',tax('0.5','6.5','100.5'),'insufficient','TAX_RATE_MISSING');
  add('D12-T03','明确 6% 的正例',tax(),'explainable_difference','EXPLICIT_TAX_RECONCILED','106');
  add('D12-T04','明确零税率，不把零当缺失',tax('0','0','100'),'explainable_difference','EXPLICIT_TAX_RECONCILED','100');
  add('D12-T05','同引文多个税率不能任选',tax('6','16%，另项目税率6'),'insufficient','TAX_RATE_MISSING');
  add('D12-T06','近似未税金额不得闭合成精确换税',tax('6','6','106','约100元'),'insufficient','QUALIFIED_AMOUNT_NOT_EXACT');
  add('D12-F01','11 AED = 2 CNY 不得被截成 1 AED = 2 CNY',fx('2026-10-05，11 AED = 2 CNY'),'insufficient','FX_BASIS_MISSING');
  add('D12-F02','负的基数不能被截成 1',fx('2026-10-05，-1 AED = 2 CNY'),'insufficient','FX_BASIS_MISSING');
  add('D12-F03','合法汇率正例',fx(),'explainable_difference','EXPLICIT_FX_RECONCILED','200');
  add('D12-F04','原始约数不能提前走汇率成功分支',fx('2026-10-05，1 AED = 2 CNY','约100元'),'insufficient','QUALIFIED_AMOUNT_NOT_EXACT');
  add('D12-Q01','raw 丢失约字时仍检查正文',pair({quote:'甲主体持股约100股'},{value:'101'}),'insufficient','QUALIFIED_AMOUNT_NOT_EXACT');
  add('D12-Q02','正文上界不是精确值',pair({quote:'甲主体持股不超过100股'},{value:'101'}),'insufficient','QUALIFIED_AMOUNT_NOT_EXACT');
  add('D12-Q03','合约一词不能触发约数误报',pair({raw:'合约100股'},{value:'100'}),'corroborated','SAME_OBSERVATION_EQUAL');
  add('D12-Q04','精确小差异仍报冲突候选',pair({value:'1000'},{value:'1001'}),'conflict','SAME_BASIS_CONFLICT');
  const rounded=(raw,unit,other,places=2)=>{
    const baseValue={'1.23万元':'12300','1.24万元':'12400','1.23亿元':'123000000','2亿元':'200000000','1.23元':'1.23'}[raw+unit];
    return pair({...money,value:baseValue,raw:`${raw}${unit}`,extra:`以${unit}四舍五入保留${places}位小数`,facts:{rounding:{value:places}}},{...money,value:other});
  };
  add('D12-R01','1.23 万元表示按百元精度舍入',rounded('1.23','万元','12345'),'explainable_difference','EXPLICIT_ROUNDING','12300');
  add('D12-R02','万元半值进位',rounded('1.24','万元','12350'),'explainable_difference','EXPLICIT_ROUNDING','12400');
  add('D12-R03','亿元两位小数为百万元精度',rounded('1.23','亿元','123450000'),'explainable_difference','EXPLICIT_ROUNDING','123000000');
  add('D12-R04','亿元零位小数',rounded('2','亿元','150000000',0),'explainable_difference','EXPLICIT_ROUNDING','200000000');
  add('D12-R05','舍入越界不得用宽泛容差闭合',rounded('1.23','万元','12350'),'conflict','SAME_BASIS_CONFLICT');
  add('D12-R06','缺舍入声明不能猜披露精度',pair({...money,value:'12300',raw:'1.23万元'},{...money,value:'12345'}),'conflict','SAME_BASIS_CONFLICT');
  add('D12-R07','元小数精度保持原行为',rounded('1.23','元','1.234'),'explainable_difference','EXPLICIT_ROUNDING','1.23');
  add('D12-N01','超过 2^53 的整数只差一股不得抹平',pair({value:'9007199254740993'},{value:'9007199254740994'}),'conflict','SAME_BASIS_CONFLICT');
  add('D12-N02','长小数相等',pair({...money,value:'0.12345678901234567890123456789'},{...money,value:'0.12345678901234567890123456789'}),'corroborated','SAME_OBSERVATION_EQUAL');
  add('D12-N03','长小数最末位差异不能误互证',pair({...money,value:'0.12345678901234567890123456789'},{...money,value:'0.12345678901234567890123456788'}),'conflict','SAME_BASIS_CONFLICT');
  return cases;
}

export const arithmeticCases=[
  {id:'NUM-01',op:'sum',args:[['0.1','0.2']],expected:'0.3'},
  {id:'NUM-02',op:'sum',args:[['9007199254740993','1']],expected:'9007199254740994'},
  {id:'NUM-03',op:'sum',args:[['9007199254740993','-9007199254740993','0.000000000000000000000001']],expected:'0.000000000000000000000001'},
  {id:'NUM-04',op:'multiply',args:['0.1','0.2'],expected:'0.02'},
  {id:'NUM-05',op:'multiply',args:['-0.5','0.2'],expected:'-0.1'},
  {id:'NUM-06',op:'roundHalfUp',args:['1.235',2],expected:'1.24'},
  {id:'NUM-07',op:'roundHalfUp',args:['-1.235',2],expected:'-1.24'},
  {id:'NUM-08',op:'roundHalfUp',args:['12349.999999999999999999',-2],expected:'12300'},
  {id:'NUM-09',op:'roundHalfUp',args:['12350',-2],expected:'12400'},
  {id:'NUM-10',op:'roundHalfUp',args:['-12350',-2],expected:'-12400'},
  {id:'NUM-11',op:'roundHalfUp',args:['150000000',-8],expected:'200000000'},
  {id:'NUM-12',op:'decimal',args:[9007199254740992],expected:null},
  {id:'NUM-13',op:'decimal',args:['1e309'],expected:null},
  {id:'NUM-14',op:'decimal',args:['-0.000'],expected:'0'},
  {id:'NUM-15',op:'multiply',args:['9'.repeat(120),'10'],expected:null},
  {id:'NUM-16',op:'roundHalfUp',args:['0',-8],expected:'0'},
  {id:'NUM-17',op:'roundHalfUp',args:['12',-9],expected:null},
  {id:'NUM-18',op:'compare',args:['1.000000000000000000000000001','1'],expected:1},
];
