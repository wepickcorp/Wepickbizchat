<%@ page contentType="text/html; charset=utf-8"%>
<%@ page import="java.util.Date" %>
<%@ page import="java.text.SimpleDateFormat" %>
<%@ page import="java.security.MessageDigest" %>
<%@ page import="org.apache.commons.codec.binary.Hex" %>
<%
/*
*******************************************************
* <결제요청 파라미터>
* 결제시 Form 에 보내는 결제요청 파라미터입니다.
*******************************************************
*/
String merchantKey 		= "2d6ECGhR1pg/1QGE1lcRI4awsWEgshjEyI8UgYslLPJSuNeyPTkdrT8XWARezvDTUJClWQWhjxzBbu7AsuLZqg==";	  // 가맹점 고유 검증키
String merchantID 		= "kistest00m"; 			                                                                      // 가맹점아이디
String goodsNm	 		= "KISPG";	 					// 결제상품명
String goodsAmt			= "1004"; 						// 결제상품금액	
String ordNm 			= "KISPG"; 						// 구매자명
String ordTel 			= "01000000000"; 				// 구매자연락처
String ordEmail 		= "kispg@kispg.com";			// 구매자메일주소
String ordNo 			= "kispg1234567890"; 			// 상품주문번호	
/*
*******************************************************
* <해쉬암호화> (수정하지 마세요)
* SHA-256 해쉬암호화는 거래 위변조를 막기위한 방법입니다. 
*******************************************************
*/
DataEncrypt sha256Enc 	= new DataEncrypt();
String ediDate 			= getyyyyMMddHHmmss();												// 전문 생성일시
String encData	 		= sha256Enc.encrypt(merchantID + ediDate + goodsAmt + merchantKey);	// Hash 값
%>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<title>KISPG  인증 페이지</title>
<script src="https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.3.1.min.js"></script>
<style>
#mask {position:absolute;z-index:9000;background-color:#000;display:none;left:0;top:0;width:100%;height:100%;}
.window {display: none;position:fixed;top:0%;width:100%;height:100%;z-index:10000;}
.cont{width:100%;height:100%;}
</style>
</head>
<body>
<script type="text/javascript">

// 운영
//var url = "https://api.kispg.co.kr";
// 테스트
var url = "https://testapi.kispg.co.kr";

function getResultUrl(resultPage) 
{ 
	var cur_url = location.href; 
	return cur_url.substring(0, cur_url.lastIndexOf('/')) + '/' + resultPage;
}

$(document).ready(function() {
	//결제창 요청시 실행됩니다.
	$("#payBtn").click(function (){
		document.payInit.returnUrl.value = getResultUrl("mPayResultSample.jsp") ;
		document.payInit.action = url + "/v2/auth";
		document.payInit.submit();
	});
	
});
</script>
<div style="text-align:center;">
<div id="sampleInput" class="paypop_con" style="padding:20px 15px 35px 15px;display: inline-block;float: none;">
<p class="square_tit mt0" style="text-align:left;"><strong>결제정보</strong></p>
<form name="payInit" method="post">
	<table class="tbl_sty02">
		<tr>
			<td>결제수단</td>
			<td><input type="text" name="payMethod" value="card"></td>
		</tr>
		<tr>
			<td>결제타입</td>
			<td><input type="text" name="trxCd" value="0"></td><!-- 일반(0)/에스크로(1) --> 
		</tr>
		<tr>
			<td>가맹점ID</td>
			<td><input type="text" name="mid" value="<%=merchantID%>"></td>
		</tr>
		<tr>
			<td>상품명</td>
			<td><input type="text" name="goodsNm" value="<%=goodsNm%>"></td>
		</tr>
		<tr>
			<td>주문번호</td>
			<td><input type="text" name="ordNo" value="<%=ordNo%>"></td>
		</tr>
		<tr>
			<td>결제금액</td>
			<td><input type="text" name="goodsAmt" value="<%=goodsAmt%>"></td>
		</tr>
		<tr>
			<td>구매자명</td>
			<td><input type="text" name="ordNm" value="<%=ordNm%>"></td>
		</tr>
		<tr>
			<td>구매자연락처</td>
			<td><input type="text" name="ordTel" value="<%=ordTel%>"></td>
		</tr>
		<tr>
			<td>구매자이메일</td>
			<td><input type="text" name="ordEmail" value="<%=ordEmail%>"></td>
		</tr>
		<tr>
			<td>returnUrl</td>
			<td><input type="text" name="returnUrl" value=""></td>
		</tr>
	</table>
	<!-- 옵션 --> 
	<input type="hidden" name="userIp"	value="0:0:0:0:0:0:0:1">
		
	<input type="hidden" name="mbsUsrId" value="user1234">
	<input type="hidden" name="ordGuardEmail" value="">
	<input type="hidden" name="rcvrAddr" value="서울특별시">
	<input type="hidden" name="rcvrPost" value="00100">
	<input type="hidden" name="mbsIp" value="127.0.0.1">
	<input type="hidden" name="mbsReserved" value="MallReserved"><!-- 상점 예약필드 -->
	<input type="hidden" name="rcvrMsg" value="rcvrMsg">
	
	<input type="hidden" name="goodsSplAmt" value="0">
	<input type="hidden" name="goodsVat" value="0">
	<input type="hidden" name="goodsSvsAmt" value="0">
	<input type="hidden" name="payReqType" value="1">
	
	<input type="hidden" name="model" value="WEB">
	<input type="hidden" name="charSet" value="UTF-8">
	<!-- <input type="hidden" name="period" value="별도 제공기간없음"> -->
	<!-- <input type="hidden" name="billHpFlg" value="0"> -->
	<!-- <input type="hidden" name="model" value="MOB"> -->
	<!-- <input type="hidden" name="channel" value="0001"> -->
	
	<!-- 변경 불가능 -->
	<input type="hidden" name="ediDate" value="<%=ediDate%>"><!-- 전문 생성일시 -->
	<input type="hidden" name="encData" value="<%=encData%>"><!-- 해쉬값 -->

</form>	
	<a href="#;" id="payBtn" class="btn_sty01 bg01" style="margin:15px;">결제하기</a>
	</div>
</div>
</body>
</html>
<%!
public final synchronized String getyyyyMMddHHmmss(){
	SimpleDateFormat yyyyMMddHHmmss = new SimpleDateFormat("yyyyMMddHHmmss");
	return yyyyMMddHHmmss.format(new Date());
}
// SHA-256 형식으로 암호화
public class DataEncrypt{
	MessageDigest md;
	String strSRCData = "";
	String strENCData = "";
	String strOUTData = "";
	
	public DataEncrypt(){ }
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
}
%>