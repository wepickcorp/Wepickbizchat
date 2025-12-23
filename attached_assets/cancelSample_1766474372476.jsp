<%@ page contentType="text/html; charset=utf-8"%>
<%@ page import="java.util.Date" %>
<%@ page import="java.text.SimpleDateFormat" %>
<%@ page import="java.security.MessageDigest" %>
<%@ page import="org.apache.commons.codec.binary.Hex" %>
<%
/*
*******************************************************
* <취소>
* 아래 취소 샘플은 ajax를 이용하여 취소 후
* 결과페이지로 submit하는 샘플 입니다. 
* 취소는 H2H 통신으로 가맹점 서버에서 처리하여도 무방합니다.
*******************************************************
*/

/*
*******************************************************
* <결제요청 파라미터>
* 결제시 Form 에 보내는 결제요청 파라미터입니다.
*******************************************************
*/
String merchantKey 		= "발급받은 상점 Key";				// 상점키
String merchantID 		= "발급받은 상점 ID"; 				// 상점아이디
String goodsAmt			= "1004"; 						// 결제상품금액

/*
*******************************************************
* <해쉬암호화> (수정하지 마세요)
* SHA-256 해쉬암호화는 거래 위변조를 막기위한 방법입니다. 
* 절대로 client side에서 처리 하지 마십시오. 
*******************************************************
*/
DataEncrypt sha256Enc 	= new DataEncrypt();
String ediDate 			= getyyyyMMddHHmmss();												// 전문 생성일시
String encData 			= sha256Enc.encrypt(merchantID + ediDate + goodsAmt + merchantKey);	// Hash 값
%>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<title>결제 취소 데모 페이지</title>
<script src="https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.3.1.min.js"></script>
</head>
<body>
<script type="text/javascript">

// 운영
//var url = "https://api.kispg.co.kr";
// 테스트
var url = "https://testapi.kispg.co.kr";

var returnUrl = "/cancelResultSample.jsp";

$(document).on("click", "#cancelBtn", function(){
	
	var formArray=$("#sampleInput *").serializeArray();
	sendData = {};
	
	for (var i = 0; i < formArray.length; i++){
		sendData[formArray[i]['name']] = formArray[i]['value'];
	}
	
	$.ajax({
        type : "POST",
        contentType: "application/json",
        url : url + "/v2/cancelTrans.do",
        data : JSON.stringify(sendData),
        dataType: 'json',
        cache : false,
        success : function(data, status,xhr) {        	 
        	receive_result(data, returnUrl, "UTF-8")
        },
        error : function(e) {}
    });
});

function receive_result(data, url, charSet){
	var form = document.createElement("form");
	document.getElementsByTagName('body')[0].appendChild(form);
	for(var key in data){
		var input = document.createElement("input");
		input.name = key;
		input.type = "hidden";
		input.value = data[key];
		form.appendChild(input);
	}
	form.acceptCharset = charSet;
	form.action = url;
	form.method = 'post';
	
	form.submit();
	
}
</script>
<div style="text-align:center;">
<div id="sampleInput" class="inputTbl_wrap paypop_con" style="display: inline-block;float: inherit;">
<p class="square_tit mt0" style="text-align:left;"><strong>결제 취소 정보</strong></p>
	<table class="tbl_sty02">
		<tr>
			<td>TID *</td>
			<td><input type="text" name="tid" value="" maxLength="30"></td>
		</tr>
		<tr>
			<td>취소금액 *</td>
			<td><input type="text" name="canAmt" value="<%=goodsAmt%>" maxLength="999999999999999"></td>
		</tr>
		<tr>
			<td>주문번호 </td>
			<td><input type="text" name="ordNo" value="" maxLength="40"></td>
		</tr>
		<tr>
			<td>MID *</td>
			<td><input type="text" name="mid" value="<%=merchantID%>" maxLength="10"></td>
		</tr>
		<tr>
			<td>취소자ID</td>
			<td><input type="text" name="canId" value="CancelTest"></td>
		</tr>
		<tr>
			<td>취소자이름</td>
			<td><input type="text" name="canNm" value="취소테스트"></td>
		</tr>
		<tr>
			<td>부분취소 여부 *</td>
			<td>
				<select id="partCanFlg" name="partCanFlg">
					<option value="0">전체 취소</option>
					<option value="1">부분 취소</option>
				</select>				
			</td>
		</tr>
		<tr>
			<td>취소사유 *</td>
			<td><input type="text" name="canMsg" value="고객요청"></td>
		</tr>
		<tr>
			<td>결제수단</td>
			<td><input type="text" name="payMethod" value="CARD"></td>
		</tr>
	</table>
	<input type="hidden" name="canPw">
	<!-- <input type="hidden" name="refundBankCd"> -->
	<!-- <input type="hidden" name="refundAccnt"> -->
	<!-- <input type="hidden" name="refundNm"> -->
	<!-- <input type="hidden" name="refundNm"> -->
	
	<!-- <input type="hidden" name="goodsSplAmt"> -->
	<!-- <input type="hidden" name="goodsVat"> -->
	<!-- <input type="hidden" name="goodsSvsAmt"> -->
	
	<!-- 변경 불가능 -->
	<input type="hidden" name="ediDate" value="<%=ediDate%>"><!-- 전문 생성일시 -->
	<input type="hidden" name="encData" value="<%=encData%>"><!-- 해쉬값 -->
	&nbsp;
	<a href="#;" id=cancelBtn class="btn_sty01 bg01" style="margin:15px;">취소하기</a>
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