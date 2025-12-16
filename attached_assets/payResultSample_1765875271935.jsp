<%@ page contentType="text/html; charset=utf-8"%>
<%@ page import="java.util.*" %>
<%@ page import="org.json.simple.JSONObject" %>
<%@ page import="org.json.simple.parser.JSONParser" %>
<%@ page import="java.text.SimpleDateFormat" %>
<%@ page import="java.security.MessageDigest" %>
<%@ page import="java.security.cert.X509Certificate" %>
<%@ page import="java.io.*" %>
<%@ page import="java.net.*"%>
<%@ page import="javax.net.ssl.*"%>
<%@ page import="org.apache.commons.codec.binary.Hex" %>
<%!
  public static String callKisPgApi(String reqMsg, String reqUrl, String charSet){
      HttpsURLConnection conn 	  = null;
      BufferedReader resultReader = null;
      PrintWriter pw 			  = null;
      URL url 					  = null;
      
      // Create a trust manager that does not validate certificate chains
      TrustManager[] trustAllCerts = new TrustManager[] { new X509TrustManager() {
          public java.security.cert.X509Certificate[] getAcceptedIssuers() {
              return null;
          }
  
          public void checkClientTrusted(X509Certificate[] certs, String authType) {
          }
  
          public void checkServerTrusted(X509Certificate[] certs, String authType) {
          }
      } };

      String apprRecvMsg = null;

      int statusCode = 0;
      int msgLen     = 0;
      StringBuffer recvBuffer = new StringBuffer();
      
      try{
        msgLen = reqMsg.getBytes(charSet).length;
      }
      catch(UnsupportedEncodingException e){
        e.printStackTrace();

        return apprRecvMsg;
      }

      try{
          SSLContext sc = SSLContext.getInstance("SSL");
          sc.init(null, trustAllCerts, new java.security.SecureRandom());
          HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
  
          // Create all-trusting host name verifier
          HostnameVerifier allHostsValid = new HostnameVerifier() {
              public boolean verify(String hostname, SSLSession session) {
                  return true;
              }
          };

          HttpsURLConnection.setDefaultHostnameVerifier(allHostsValid);
          url = new URL(reqUrl);
          conn = (HttpsURLConnection) url.openConnection();
          conn.setRequestMethod("POST");
          conn.setConnectTimeout(15000);
          conn.setReadTimeout(25000);
          conn.setDoOutput(true);
          conn.setRequestProperty("Content-Type", "application/json; charset=" + charSet);
          conn.setRequestProperty("Content-Length", String.valueOf(msgLen));

          pw = new PrintWriter(conn.getOutputStream());
          pw.write(reqMsg);
          pw.flush();
          
          statusCode = conn.getResponseCode();

          resultReader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "utf-8"));

          for(String temp; (temp = resultReader.readLine()) != null;){
              recvBuffer.append(temp).append("\n");
          }
          
          if(!(statusCode == HttpURLConnection.HTTP_OK)){
              throw new Exception();
          }

          apprRecvMsg = recvBuffer.toString().trim();
          
          return apprRecvMsg;
      }catch (Exception e){
        e.printStackTrace();

        return apprRecvMsg;
      }finally{
          recvBuffer.setLength(0);
          
          try{
              if(resultReader != null){
                  resultReader.close();
              }
          }catch(Exception ex){
              resultReader = null;
          }
          
          try{
              if(pw != null) {
                  pw.close();
              }
          }catch(Exception ex){
              pw = null;
          }
          
          try{
              if(conn != null) {
                  conn.disconnect();
              }
          }catch(Exception ex){
              conn = null;
          }
      }
  }

  public String encrypt(String strData){
  	String passACL = null;
  	MessageDigest md = null;
  	try{
  		md = MessageDigest.getInstance("SHA-256");
  		md.reset();
  		md.update(strData.getBytes());
  		byte[] raw = md.digest();
  		passACL = encodeHex(raw);
  	}catch(Exception e){
  		System.out.print("암호화 에러" + e.toString());
  	}
  	return passACL;
  }
  
  public String encodeHex(byte [] b){
  	char [] c = Hex.encodeHex(b);
  	return new String(c);
  }

  public final synchronized String getyyyyMMddHHmmss(){
  	SimpleDateFormat yyyyMMddHHmmss = new SimpleDateFormat("yyyyMMddHHmmss");
  	return yyyyMMddHHmmss.format(new Date());
  }

  public HashMap<String,String> jsonDataParser(String jsonStr){
    HashMap<String,String> jsonHash = new HashMap<String,String>();
    
    try{
        JSONParser parser = new JSONParser();    
        Object obj = parser.parse(jsonStr);  
        JSONObject jsonObj = (JSONObject) obj;
        
        Iterator iter = jsonObj.keySet().iterator();
        
        while(iter.hasNext()){
           String key   = (String) iter.next();
           String value = (String) jsonObj.get(key);
    
           jsonHash.put(key, value);
        }
    }
    catch(Exception e){
        e.printStackTrace();
    }

    return jsonHash;
  }
%>
<%
  request.setCharacterEncoding("utf-8");
  
  /*------------ 인증 데이터 로깅 --------------*/

  Enumeration params = request.getParameterNames();
  
  while(params.hasMoreElements()) {
    String name = (String) params.nextElement();
    System.out.print(name + " : " + request.getParameter(name) + "\r\n"); 
  }  

  String charset     = "utf-8";   // 가맹점 charset
  String mid         = "kistest00m";        // 상점아이디
  String merchantKey = "2d6ECGhR1pg/1QGE1lcRI4awsWEgshjEyI8UgYslLPJSuNeyPTkdrT8XWARezvDTUJClWQWhjxzBbu7AsuLZqg==";        // 상점키

  String t_apprReqUrl  = "https://testapi.kispg.co.kr/v2/payment";  //개발
  String r_apprReqUrl  = "https://api.kispg.co.kr/v2/payment";      //운영
  
  String resultCd    = request.getParameter("resultCd");     //  인증 결과코드 (정상 : 0000)
  String resultMsg   = request.getParameter("resultMsg");    //  인증 결과메시지
  String payMethod   = request.getParameter("payMethod");    //  인증 결제수단 (ex. card)
  String tid         = request.getParameter("tid");          //  KISPG TID
  String goodsAmt    = request.getParameter("amt");          //  결제금액
  String mbsReserved = request.getParameter("mbsReserved");  //  가맹점 에코필드  

  String ediDate     = getyyyyMMddHHmmss();                             // 결제요청시간 (yyyyMMddHHmmss)
  String encData     = encrypt(mid + ediDate + goodsAmt + merchantKey);	// 가맹점 검증 해쉬값
  
  /*승인 응답파라미터 정의*/
  String r_resultCode = "";
  String r_resultMsg  = "";
  String r_payMethod  = "";
  String r_amt        = "";
  String r_tid        = "";
  String r_ordNm      = "";
  String r_goodsName  = "";
  String r_fnNm       = "";
  String r_quota      = "";

  if(null != resultCd && resultCd.equals("0000")){
    JSONObject jsonObj = new JSONObject();

    jsonObj.put("mid"     , mid);
    jsonObj.put("tid"     , tid);
    jsonObj.put("goodsAmt", goodsAmt);
    jsonObj.put("ediDate" , ediDate);
    jsonObj.put("encData" , encData);
    jsonObj.put("charset" , charset);
  
    String apprReqMsg = jsonObj.toString();
  
    System.out.println("[apprReqMsg : " + apprReqMsg + "]");
  
    String apprRecvMsg = callKisPgApi(apprReqMsg, t_apprReqUrl, charset);
  
    System.out.println("[apprRecvMsg : " + apprRecvMsg + "]");
  
    HashMap<String,String> apprRecvHash = jsonDataParser(apprRecvMsg);
  
    r_resultCode  = apprRecvHash.get("resultCd");   //승인 결과코드
    r_resultMsg   = apprRecvHash.get("resultMsg");  //승인 결과메시지
    r_payMethod   = apprRecvHash.get("payMethod");  //승인 결제수단
    r_amt         = apprRecvHash.get("amt");        //결제금액
    r_tid         = apprRecvHash.get("tid");        //TID
    r_ordNm       = apprRecvHash.get("ordNm");      //주문자명
    r_goodsName   = apprRecvHash.get("goodsName");  //상품명
    r_fnNm        = apprRecvHash.get("fnNm");       //카드사명
    r_quota       = apprRecvHash.get("quota");      //승인 할부개월
  }
%>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Cache-Control" content="no-cache" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<title>KISPG 결과페이지</title>
<style>
.pop_wrap {background:rgba(0, 0, 0, 0.4);}
.tbl_th{box-sizing:border-box; line-height:40px; padding:0px 10px 0px 10px; text-align:left; width:160px; background:#e9eaeb; border-top:1px solid #2a323c; border-bottom:1px solid #d4d6d8; font-size:15px; font-weight:normal; color:#333; font-family:'Malgun Gothic','맑은 고딕',sans-serif;}
.tbl_td{box-sizing:border-box; line-height:40px; padding:0px 10px 0px 10px; text-align:left; border-top:1px solid #2a323c; border-bottom:1px solid #d4d6d8; font-size:15px; font-weight:bold; color:#333; font-family:'Malgun Gothic','맑은 고딕',sans-serif;}
</style>
</head>
<body>
<div style="width: 100%; text-align: center;">
    <div id="sampleInput" style="display: inline-block; padding:0 10px; margin:0 auto;">
        <table style="border-spacing:0;">
            <tbody>
                <tr>
                    <td colspan="3"><p style="margin:10px 0 10px; text-align:center; font-size:34px; color:#2a323c; font-family:'Malgun Gothic','맑은 고딕',sans-serif;">결제 결과</p></td>
                </tr>                		
                <tr>
                    <td colspan="3">
                        <table style="border-collapse:collapse; width:100%">
                            <tbody>
                                <tr>
                                    <th scope="row" class="tbl_th">인증 결과</th>
                                </tr>
                                <tr>
                                    <td class="tbl_td">[<%=resultCd%>]<%=resultMsg%></td>
                                </tr>	                                
                                <tr>
                                    <th scope="row" class="tbl_th">결과 내용</th>
                                </tr>
                                <tr>
                                    <td class="tbl_td">[<%=r_resultCode%>]<%=r_resultMsg%></td>
                                </tr>                              
                                <tr>
                                    <th scope="row" class="tbl_th">결제수단</th>
                                </tr>
                                <tr>
                                    <td class="tbl_td"><%=r_payMethod%></td>
                                </tr>
                                <tr>
                                    <th scope="row" class="tbl_th">금액</th>
                                 </tr>
                                <tr>
                                    <td class="tbl_td"><%=r_amt%></td>
                                </tr>
                                <tr>
                                    <th scope="row" class="tbl_th">거래아이디</th>
                                 </tr>
                                <tr>
                                    <td class="tbl_td"><%=r_tid%></td>
                                </tr>
                                <tr>
                                    <th scope="row" class="tbl_th">구매자명</th>
                                 </tr>
                                <tr>
                                    <td class="tbl_td"><%=r_ordNm%>&nbsp;</td>
                                </tr>
                                <tr>
									<th scope="row" class="tbl_th">상품명</th>
							      </tr>
                                <tr>
									<td class="tbl_td"><%=r_goodsName%></td>
								</tr>
								<tr>
									<th scope="row" class="tbl_th">카드사</th>
								 </tr>
                                <tr>
									<td class="tbl_td"><%=r_fnNm%></td>
								</tr>
								<tr>
									<th scope="row" class="tbl_th">할부개월</th>
									 </tr>
                                <tr>
									<td class="tbl_td"><%=r_quota%></td>
								</tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
</body>
</html>
