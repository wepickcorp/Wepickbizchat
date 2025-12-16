<%@ page contentType="text/html; charset=euc-kr"%>
<%@ page import="java.util.Date" %>
<%@ page import="java.text.SimpleDateFormat" %>
<%@ page import="java.security.MessageDigest" %>
<%@ page import="org.apache.commons.codec.binary.Hex" %>
<%
/*
*******************************************************
* <������û �Ķ����>
* ������ Form �� ������ ������û �Ķ�����Դϴ�.
*******************************************************
*/
String merchantKey 		= "2d6ECGhR1pg/1QGE1lcRI4awsWEgshjEyI8UgYslLPJSuNeyPTkdrT8XWARezvDTUJClWQWhjxzBbu7AsuLZqg==";	  // ������ ���� ����Ű
String merchantID 		= "kistest00m"; 			                                                                      // ���������̵�
String goodsNm	 		= "KISPG";	 					// ������ǰ��
String goodsAmt			= "1004"; 						// ������ǰ�ݾ�	
String ordNm 			= "KISPG"; 						// �����ڸ�
String ordTel 			= "01000000000"; 				// �����ڿ���ó
String ordEmail 		= "kispg@kispg.com";			// �����ڸ����ּ�
String ordNo 			= "kispg1234567890"; 			// ��ǰ�ֹ���ȣ	
String returnURL 		= "./payResultSample.jsp";      // ���������(������)
/*
*******************************************************
* <�ؽ���ȣȭ> (�������� ������)
* SHA-256 �ؽ���ȣȭ�� �ŷ� �������� �������� ����Դϴ�. 
*******************************************************
*/
DataEncrypt sha256Enc 	= new DataEncrypt();
String ediDate 			= getyyyyMMddHHmmss();												// ���� �����Ͻ�
String encData	 		= sha256Enc.encrypt(merchantID + ediDate + goodsAmt + merchantKey);	// Hash ��
%>
<!DOCTYPE html>
<html>
<head>
<meta charset="euc-kr">
<meta http-equiv="Cache-Control" content="no-cache" />
<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0, maximum-scale=3.0">
<title>KISPG  ���� ������</title>
<script src="https://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.3.1.min.js"></script>
<style>
#mask {position:absolute;z-index:9000;background-color:#000;display:none;left:0;top:0;width:100%;height:100%;}
.window {display: none;position:fixed;top:0%;width:100%;height:100%;z-index:10000;}
.cont{width:100%;height:100%;}
</style>
</head>
<body>
<script type="text/javascript">

// �
//var url = "https://api.kispg.co.kr";
// �׽�Ʈ
var url = "https://testapi.kispg.co.kr";

$(document).ready(function() {

	//����â ��û�� ����˴ϴ�.
	$("#payBtn").click(function (){
			
			//Calculate mask size
			var maskHeight = $(document).height();
			var maskWidth = $(document).width();
				
			$("#mask").fadeIn(0);
			$("#mask").fadeTo("slow", 0.6);        
			
			document.payInit.action = url + "/v2/auth";
			document.payInit.submit();
			$(".window").show();
	});
	
});

const ajax = getXMLHTTPRequest();

function getXMLHTTPRequest() {
	let request = false;
	try { request = new XMLHttpRequest(); }
	catch(err01) {
		try { request = new ActiveXObject("Msxml2.XMLHTTP"); }
		catch(err02) { 
			try { request = new ActiveXObject("Microsoft.XMLHTTP"); }
			catch(err03) { request = false; }
		}
	}
	return request;
}

//결제창 종료 함수 <<수정 불가능>>
window.addEventListener("message", returnData, false);

//결제창 종료 함수 <<'returnData' 수정 불가능>>
function returnData (e){
	var frm = document.payInit;

	console.log("e.data : " + JSON.stringify(e.data));

	if(false == isEmptyObj(e.data.resultCode)){
    	if (e.data.resultCode == '0000'){
			receive_result(e.data.data, frm.returnUrl.value, frm.charSet.value);
    	}
    	else if(e.data.resultCode == 'XXXX'){ //인증실패시
        	console.log("[e.data.resultCode : " + e.data.resultCode + "]");

			var resData = e.data.data;

        	alert("[RESULTCD : " + resData.resultCd + "] / [RESULT MSG : " + resData.resultMsg + "]");			
		}

		$("#mask, .window").hide();
		$("#pay_frame").attr("src", "");
	}
}

function isEmptyObj(obj)  {
  if(obj.constructor === Object
     && Object.keys(obj).length === 0)  {
    return true;
  }
  
  return false;
}

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
<div id="sampleInput" class="paypop_con" style="padding:20px 15px 35px 15px;display: inline-block;float: none;">
<p class="square_tit mt0" style="text-align:left;"><strong>��������</strong></p>
<form name="payInit" method="post" target="pay_frame">
	<table class="tbl_sty02">
		<tr>
			<td>��������</td>
			<td><input type="text" name="payMethod" value="card"></td>
		</tr>
		<tr>
			<td>����Ÿ��</td>
			<td><input type="text" name="trxCd" value="0"></td><!-- �Ϲ�(0)/����ũ��(1) --> 
		</tr>
		<tr>
			<td>������ID</td>
			<td><input type="text" name="mid" value="<%=merchantID%>"></td>
		</tr>
		<tr>
			<td>��ǰ��</td>
			<td><input type="text" name="goodsNm" value="<%=goodsNm%>"></td>
		</tr>
		<tr>
			<td>�ֹ���ȣ</td>
			<td><input type="text" name="ordNo" value="<%=ordNo%>"></td>
		</tr>
		<tr>
			<td>�����ݾ�</td>
			<td><input type="text" name="goodsAmt" value="<%=goodsAmt%>"></td>
		</tr>
		<tr>
			<td>�����ڸ�</td>
			<td><input type="text" name="ordNm" value="<%=ordNm%>"></td>
		</tr>
		<tr>
			<td>�����ڿ���ó</td>
			<td><input type="text" name="ordTel" value="<%=ordTel%>"></td>
		</tr>
		<tr>
			<td>�������̸���</td>
			<td><input type="text" name="ordEmail" value="<%=ordEmail%>"></td>
		</tr>
		<tr>
			<td>returnUrl</td>
			<td><input type="text" name="returnUrl" value="<%=returnURL%>"></td>
		</tr>		
	</table>
	<!-- �ɼ� --> 
	<input type="hidden" name="userIp"	value="0:0:0:0:0:0:0:1">
		
	<input type="hidden" name="mbsUsrId" value="user1234">
	<input type="hidden" name="ordGuardEmail" value="">
	<input type="hidden" name="rcvrAddr" value="����Ư����">
	<input type="hidden" name="rcvrPost" value="00100">
	<input type="hidden" name="mbsIp" value="127.0.0.1">
	<input type="hidden" name="mbsReserved" value="MallReserved"><!-- ���� �����ʵ� -->
	<input type="hidden" name="rcvrMsg" value="rcvrMsg">
	
	<input type="hidden" name="goodsSplAmt" value="0">
	<input type="hidden" name="goodsVat" value="0">
	<input type="hidden" name="goodsSvsAmt" value="0">
	<input type="hidden" name="payReqType" value="1">
	
	<input type="hidden" name="model" value="WEB">
	<input type="hidden" name="charSet" value="euc-kr">
	<!-- <input type="hidden" name="period" value="���� �����Ⱓ����"> -->
	<!-- <input type="hidden" name="billHpFlg" value="0"> -->
	<!-- <input type="hidden" name="model" value="MOB"> -->
	<!-- <input type="hidden" name="channel" value="0001"> -->
	
	<!-- ���� �Ұ��� -->
	<input type="hidden" name="ediDate" value="<%=ediDate%>"><!-- ���� �����Ͻ� -->
	<input type="hidden" name="encData" value="<%=encData%>"><!-- �ؽ��� -->

</form>	
	<a href="#;" id="payBtn" class="btn_sty01 bg01" style="margin:15px;">�����ϱ�</a>
	</div>
</div>
<div id="mask"></div>
<div class="window">
	<div class="cont">
		<iframe id="pay_frame" name="pay_frame" style="width:100%; height:100%;" src="" marginwidth="0" marginheight="0" frameborder="no" scrolling="no"></iframe>
	</div>
</div>
</body>
</html>
<%!
public final synchronized String getyyyyMMddHHmmss(){
	SimpleDateFormat yyyyMMddHHmmss = new SimpleDateFormat("yyyyMMddHHmmss");
	return yyyyMMddHHmmss.format(new Date());
}
// SHA-256 �������� ��ȣȭ
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
			System.out.print("��ȣȭ ����" + e.toString());
		}
		return passACL;
	}
	
	public String encodeHex(byte [] b){
		char [] c = Hex.encodeHex(b);
		return new String(c);
	}
}
%>